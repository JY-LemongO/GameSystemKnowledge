#!/usr/bin/env python3
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
import json, sys
from browser_launch import launch_chromium

ROOT = Path(__file__).resolve().parents[2]
pages = json.loads((ROOT/'source/site-map.json').read_text(encoding='utf-8'))
GOLDEN = json.loads((ROOT/'source/runtime/fixtures/fireball-golden-v2.json').read_text(encoding='utf-8'))
CAPSTONE_PASSING = json.loads((ROOT/'source/runtime/tests/fixtures/capstone-passing-submission-v1.json').read_text(encoding='utf-8'))
RUNTIME_PAGE = next((item for item in pages if item['file'] == 'modules/runtime-reference.html'), None)
RUNTIME_FILE = RUNTIME_PAGE['file'] if RUNTIME_PAGE else None
LEARNING_PAGES = sorted(
    (item for item in pages if isinstance(item.get('learningOrder'), int)),
    key=lambda item: item.get('learningOrder', 0),
)
LEARNING_FILES = [item['file'] for item in LEARNING_PAGES]
LEARNING_COUNT = len(LEARNING_FILES)
SYSTEM_NAV_FILES = {
    'index.html', 'modules/core-runtime.html', 'modules/stat-system.html',
    'modules/effect-system.html', 'modules/skill-action-system.html',
    'modules/combat-resolution-system.html', 'modules/status-system.html',
    'modules/integration-map.html',
}
MOBILE_NAV_FILES = {'index.html', 'modules/integration-map.html'}
errors=[]
checks=[]
CSS=(ROOT/'assets/css/site.css').read_text(encoding='utf-8')
SCRIPT_MAP={
    'search-index.js':(ROOT/'assets/js/search-index.js').read_text(encoding='utf-8'),
    'runtime-kernel.js':(ROOT/'assets/js/runtime-kernel.js').read_text(encoding='utf-8'),
    'capstone-assessor.js':(ROOT/'assets/js/capstone-assessor.js').read_text(encoding='utf-8'),
    'app.js':(ROOT/'assets/js/app.js').read_text(encoding='utf-8'),
}
PIXEL='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700"%3E%3Crect width="1200" height="700" fill="%23f3f4f6"/%3E%3C/svg%3E'
WIDE_PIXEL='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="5000" height="700" viewBox="0 0 5000 700"%3E%3Crect width="5000" height="700" fill="%23f3f4f6"/%3E%3C/svg%3E'
TALL_PIXEL='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="1900" viewBox="0 0 800 1900"%3E%3Crect width="800" height="1900" fill="%23f3f4f6"/%3E%3C/svg%3E'
COMPONENT_LAYOUT_AUDIT=r"""
() => {
  const px = (value) => Number.parseFloat(value) || 0;
  const near = (actual, expected) => Math.abs(actual - expected) <= 0.6;
  const issues = [];
  let checked = false;

  const checklist = [...document.querySelectorAll('ul.checklist')];
  if (checklist.length) {
    checked = true;
    for (const list of checklist) {
      if (!near(px(getComputedStyle(list).paddingLeft), 0)) issues.push('checklist-list-padding');
      for (const item of list.querySelectorAll(':scope > li')) {
        const style = getComputedStyle(item);
        const marker = getComputedStyle(item, '::before');
        const markerEnd = px(marker.left) + px(marker.width);
        if (px(style.paddingLeft) < markerEnd + 4) issues.push('checklist-marker-overlap');
        if (!near(px(style.marginTop), 0) || !near(px(style.marginBottom), 0)) issues.push('checklist-item-margin');
      }
    }
  }

  const checkpointGrid = document.querySelector('.checkpoint-grid');
  if (checkpointGrid) {
    checked = true;
    const gridStyle = getComputedStyle(checkpointGrid);
    if (!near(px(gridStyle.paddingLeft), 0) || px(gridStyle.marginTop) < 20 || !near(px(gridStyle.marginBottom), 0)) issues.push('checkpoint-grid-spacing');
    const item = checkpointGrid.querySelector(':scope > li');
    if (item) {
      const itemStyle = getComputedStyle(item);
      if (!near(px(itemStyle.marginTop), 0) || !near(px(itemStyle.marginBottom), 0) || !near(px(itemStyle.paddingLeft), 0)) {
        issues.push('checkpoint-item-spacing');
      }
    }
    const intro = document.querySelector('.checkpoint-intro');
    const answer = document.querySelector('.checkpoint-answer p');
    if (intro) {
      const introStyle = getComputedStyle(intro);
      if (!near(px(introStyle.marginBottom), 0)) issues.push('checkpoint-intro-margin');
      if (answer && introStyle.color !== getComputedStyle(answer).color) issues.push('checkpoint-intro-color');
    }
  }

  const progressStatus = document.querySelector('.learning-progress-status');
  if (progressStatus) {
    checked = true;
    const style = getComputedStyle(progressStatus);
    const meterLabel = document.querySelector('.learning-progress-meter span');
    if (px(style.fontSize) > 12 || px(style.lineHeight) > 20 || px(style.marginTop) >= 0 || !near(px(style.marginBottom), 0)) {
      issues.push('progress-status-typography');
    }
    if (meterLabel && style.color !== getComputedStyle(meterLabel).color) issues.push('progress-status-color');
  }

  const runtimeLists = [
    ['.runtime-trace', 8],
    ['.runtime-events', 8],
    ['.migration-audit', 0],
  ];
  for (const [selector, expectedPadding] of runtimeLists) {
    const list = document.querySelector(selector);
    if (!list) continue;
    checked = true;
    const style = getComputedStyle(list);
    if (!near(px(style.paddingLeft), expectedPadding) || !near(px(style.marginBottom), 0)) issues.push(`${selector}-spacing`);
    for (const item of list.querySelectorAll(':scope > li')) {
      const itemStyle = getComputedStyle(item);
      if (!near(px(itemStyle.marginTop), 0) || !near(px(itemStyle.marginBottom), 0)) issues.push(`${selector}-item-margin`);
    }
  }

  const captions = [...document.querySelectorAll('.thumb .cap')];
  if (captions.length) {
    checked = true;
    for (const caption of captions) {
      const style = getComputedStyle(caption);
      const mutedControl = caption.closest('.thumb')?.querySelector('.small');
      if (px(style.fontSize) > 12 || px(style.lineHeight) > 20 || !near(px(style.marginBottom), 0)) issues.push('diagram-caption-typography');
      if (mutedControl && style.color !== getComputedStyle(mutedControl).color) issues.push('diagram-caption-color');
    }
  }

  return { checked, issues: [...new Set(issues)] };
}
"""

def inline_page(file):
    soup=BeautifulSoup((ROOT/file).read_text(encoding='utf-8'),'html.parser')
    for link in list(soup.select('link[rel="stylesheet"]')):
        style=soup.new_tag('style'); style.string=CSS; link.replace_with(style)
    for script in list(soup.select('script[src]')):
        name=Path(script.get('src','')).name
        if name in SCRIPT_MAP:
            replacement=soup.new_tag('script'); replacement.string=SCRIPT_MAP[name]; script.replace_with(replacement)
        else:
            script.decompose()
    for image in soup.select('img[src]'):
        source_name=Path(urlparse(image.get('src','')).path).name
        if source_name in ('09_effect_component_diagram.svg', '39_runtime_ports_and_adapters.svg'):
            image['src']=WIDE_PIXEL
        elif source_name == '40_resolve_commit_reaction_sequence.svg':
            image['src']=TALL_PIXEL
        else:
            image['src']=PIXEL
    return '<!DOCTYPE html>\n'+str(soup)

def check(condition, label):
    checks.append({'label':label,'pass':bool(condition)})
    if not condition: errors.append(label)

with sync_playwright() as p:
    browser=launch_chromium(p)
    for viewport_name, viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
        context=browser.new_context(viewport=viewport, device_scale_factor=1)
        for item in pages:
            page=context.new_page()
            js_errors=[]
            page.on('pageerror', lambda exc, bucket=js_errors: bucket.append(str(exc)))
            page.set_content(inline_page(item['file']), wait_until='load')
            page.wait_for_timeout(60)
            component_layout=page.evaluate(COMPONENT_LAYOUT_AUDIT)
            if component_layout['checked']:
                details=', '.join(component_layout['issues'])
                check(not component_layout['issues'], f'{viewport_name}:{item["file"]}:component-layout' + (f' ({details})' if details else ''))
            overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            check(overflow <= 1, f'{viewport_name}:{item["file"]}:no-horizontal-overflow')
            check(not js_errors, f'{viewport_name}:{item["file"]}:no-js-errors' + (f' ({js_errors})' if js_errors else ''))
            check(page.locator('h1').count()==1, f'{viewport_name}:{item["file"]}:one-h1')
            check(page.locator('[data-example-language="csharp"]').count()==1, f'{viewport_name}:{item["file"]}:csharp-language-badge')
            csharp_blocks=page.locator('#article-content code.language-csharp')
            if csharp_blocks.count():
                check(page.locator('.code-head span').filter(has_text='C#').count()==csharp_blocks.count(), f'{viewport_name}:{item["file"]}:csharp-code-labels')
            json_blocks=page.locator('#article-content code.language-json')
            if json_blocks.count():
                check(page.locator('.code-head span').filter(has_text='JSON').count()==json_blocks.count(), f'{viewport_name}:{item["file"]}:json-code-labels')
            reading_time=page.locator('[data-reading-time]')
            if reading_time.count():
                check(reading_time.inner_text().startswith('읽기 약 '), f'{viewport_name}:{item["file"]}:reading-time-label')
                check('· 실습 별도' in reading_time.inner_text(), f'{viewport_name}:{item["file"]}:reading-time-separates-practice')
            if page.locator('.page-toc a').count():
                check(page.locator('.page-toc a[aria-current="location"]').count()>=1, f'{viewport_name}:{item["file"]}:toc-current-location')
            if page.locator('#article-content table').count():
                first_table=page.locator('#article-content table').first
                check(bool(first_table.get_attribute('aria-labelledby')), f'{viewport_name}:{item["file"]}:table-labelled')
                check(first_table.locator('th:not([scope])').count()==0, f'{viewport_name}:{item["file"]}:table-header-scope')
            if item['file'] in SYSTEM_NAV_FILES:
                check(page.locator('.system-dock a[aria-current="page"]').count()==1, f'{viewport_name}:{item["file"]}:system-nav-current')
            if viewport_name == 'mobile':
                check(not page.locator('.system-dock').is_visible(), f'{viewport_name}:{item["file"]}:system-dock-hidden')
                check(page.locator('.mobile-bar').is_visible(), f'{viewport_name}:{item["file"]}:single-bottom-nav-visible')
                check(page.locator('[data-focus-toggle]').is_visible(), f'{viewport_name}:{item["file"]}:focus-toggle-reachable')
                check(not page.locator('.breadcrumb').is_visible(), f'{viewport_name}:{item["file"]}:breadcrumb-hidden')
                if item['file'] in MOBILE_NAV_FILES:
                    check(page.locator('.mobile-bar a[aria-current="page"]').count()==1, f'{viewport_name}:{item["file"]}:mobile-nav-current')
            page.close()
        context.close()

    # Learning progress needs a stable HTTP origin so localStorage survives reload and navigation.
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page(); progress_errors=[]
    page.on('pageerror', lambda exc: progress_errors.append(str(exc)))

    def fulfill_learning_site(route):
        file=urlparse(route.request.url).path.lstrip('/') or 'index.html'
        if file in {item['file'] for item in pages}:
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body=inline_page(file))
        else:
            route.fulfill(status=404, content_type='text/plain', body='Not found')

    context.route('http://gsf.test/**', fulfill_learning_site)
    page.goto('http://gsf.test/index.html', wait_until='load')
    page.wait_for_timeout(80)
    check(page.locator('[data-learning-progress]').is_visible(),'learning-progress:home-visible')
    check(page.locator('[data-learning-progress-count]').inner_text()==f'0 / {LEARNING_COUNT}','learning-progress:initial-count')
    check(page.locator('[data-learning-progress-meter]').evaluate('el => el.value')==0,'learning-progress:initial-meter')
    check(page.locator('[data-learning-resume]').get_attribute('href').endswith('modules/core-runtime.html'),'learning-progress:initial-core-link')

    page.goto('http://gsf.test/modules/core-runtime.html', wait_until='load')
    page.wait_for_timeout(80)
    check(page.locator('details[data-checkpoint-question]').count()==3,'learning-checkpoint:three-questions')
    first_summary=page.locator('details[data-checkpoint-question] summary').first
    first_summary.focus(); page.keyboard.press('Enter')
    check(page.locator('details[data-checkpoint-question]').first.evaluate('el => el.open'),'learning-checkpoint:keyboard-opens-answer')
    check(first_summary.evaluate('el => getComputedStyle(el).outlineStyle')!='none','learning-checkpoint:focus-visible')
    complete=page.locator('[data-learning-complete]')
    check(complete.inner_text()=='읽기 완료','learning-progress:completion-is-reading-not-mastery')
    complete.focus(); page.keyboard.press('Enter')
    check(complete.get_attribute('aria-pressed')=='true','learning-progress:core-completed')
    saved=page.evaluate("JSON.parse(localStorage.getItem('gsf-learning-progress-v1'))")
    check(saved.get('version')==1 and saved.get('completed')==[LEARNING_FILES[0]] and saved.get('lastVisited')==LEARNING_FILES[0],'learning-progress:stored-contract')
    page.reload(wait_until='load'); page.wait_for_timeout(80)
    check(page.locator('[data-learning-complete]').get_attribute('aria-pressed')=='true','learning-progress:completion-survives-reload')

    page.goto('http://gsf.test/index.html', wait_until='load'); page.wait_for_timeout(80)
    check(page.locator('[data-learning-progress-count]').inner_text()==f'1 / {LEARNING_COUNT}','learning-progress:home-count-after-completion')
    check(page.locator('[data-learning-progress-meter]').evaluate('el => el.value')==1,'learning-progress:home-meter-after-completion')
    check(page.locator('[data-learning-resume]').get_attribute('href').endswith('modules/stat-system.html'),'learning-progress:resume-next-incomplete')

    page.evaluate("localStorage.setItem('gsf-learning-progress-v1', '{broken')")
    page.reload(wait_until='load'); page.wait_for_timeout(80)
    check(page.locator('[data-learning-progress-count]').inner_text()==f'0 / {LEARNING_COUNT}','learning-progress:corrupt-state-recovers')
    page.evaluate("([files]) => localStorage.setItem('gsf-learning-progress-v1', JSON.stringify({version:1, completed:files, lastVisited:files[files.length-1]}))", [LEARNING_FILES])
    page.reload(wait_until='load'); page.wait_for_timeout(80)
    check(page.locator('[data-learning-progress-count]').inner_text()==f'{LEARNING_COUNT} / {LEARNING_COUNT}','learning-progress:all-complete-count')
    check(page.locator('[data-learning-resume]').get_attribute('href').endswith('modules/diagram-gallery.html'),'learning-progress:all-complete-reference-link')
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('[data-learning-reset]').click()
    check(page.locator('[data-learning-progress-count]').inner_text()==f'0 / {LEARNING_COUNT}','learning-progress:reset-count')
    check(page.evaluate("localStorage.getItem('gsf-learning-progress-v1')") is None,'learning-progress:reset-storage')

    page.set_viewport_size({'width':320,'height':844})
    page.goto('http://gsf.test/modules/core-runtime.html', wait_until='load'); page.wait_for_timeout(80)
    for details in page.locator('details[data-checkpoint-question]').all():
        details.locator('summary').click()
    overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(overflow <= 1,'learning-checkpoint:mobile-320-no-horizontal-overflow')
    complete_box=page.locator('[data-learning-complete]').bounding_box()
    check(bool(complete_box) and complete_box['width'] <= 320 and complete_box['height'] >= 44,'learning-progress:mobile-complete-control-size')
    visible_hints=page.locator('[data-horizontal-scroll-hint]:visible')
    check(visible_hints.count()>=1,'horizontal-scroll:mobile-overflow-hint-visible')
    keyboard_scrollers=page.locator('[data-horizontal-scroll-managed][tabindex="0"]')
    check(keyboard_scrollers.count()>=1,'horizontal-scroll:overflow-region-keyboard-reachable')
    if keyboard_scrollers.count():
        described_by=keyboard_scrollers.first.get_attribute('aria-describedby') or ''
        check(any(page.locator(f'#{token}').count() for token in described_by.split()),'horizontal-scroll:accessible-description-target')
    check(not progress_errors,'learning-progress:no-page-errors' + (f' ({progress_errors})' if progress_errors else ''))
    context.close()

    blocked_context=browser.new_context(viewport={'width':390,'height':844})
    blocked_context.add_init_script("""
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Storage.prototype[method] = function () { throw new DOMException('Storage blocked', 'SecurityError'); };
      }
    """)
    blocked_context.route('http://gsf.test/**', fulfill_learning_site)
    blocked_page=blocked_context.new_page(); blocked_errors=[]
    blocked_page.on('pageerror', lambda exc: blocked_errors.append(str(exc)))
    blocked_page.goto('http://gsf.test/index.html', wait_until='load'); blocked_page.wait_for_timeout(80)
    check(blocked_page.locator('[data-learning-progress]').is_visible(),'learning-progress:blocked-storage-panel-visible')
    check('저장할 수 없습니다' in blocked_page.locator('[data-learning-progress-status]').inner_text(),'learning-progress:blocked-storage-warning')
    blocked_page.goto('http://gsf.test/modules/core-runtime.html', wait_until='load'); blocked_page.wait_for_timeout(80)
    blocked_complete=blocked_page.locator('[data-learning-complete]')
    blocked_complete.click()
    check(blocked_complete.get_attribute('aria-pressed')=='false','learning-progress:blocked-storage-no-false-completion')
    check('저장할 수 없습니다' in blocked_page.locator('[data-learning-status]').inner_text(),'learning-progress:blocked-storage-toggle-warning')
    check(not blocked_errors,'learning-progress:blocked-storage-no-page-errors' + (f' ({blocked_errors})' if blocked_errors else ''))
    blocked_context.close()

    nojs_context=browser.new_context(viewport={'width':390,'height':844}, java_script_enabled=False)
    nojs_context.route('http://gsf.test/**', fulfill_learning_site)
    nojs_page=nojs_context.new_page()
    nojs_page.goto('http://gsf.test/modules/core-runtime.html', wait_until='load')
    check(nojs_page.locator('#article-content').is_visible(),'learning-progress:nojs-core-content-visible')
    check(nojs_page.locator('[data-learning-checkpoint]').is_visible(),'learning-progress:nojs-checkpoint-visible')
    check(nojs_page.locator('[data-learning-completion]').count()==0,'learning-progress:nojs-dynamic-completion-absent')
    nojs_page.goto('http://gsf.test/index.html', wait_until='load')
    check(not nojs_page.locator('[data-learning-progress]').is_visible(),'learning-progress:nojs-panel-hidden')
    check(nojs_page.locator('.system-card').count()==6,'learning-progress:nojs-learning-links-visible')
    nojs_context.close()

    legacy_draft_context=browser.new_context(viewport={'width':390,'height':844})
    legacy_draft_context.route('http://gsf.test/**', fulfill_learning_site)
    legacy_draft_page=legacy_draft_context.new_page(); legacy_draft_errors=[]
    legacy_draft_page.on('pageerror', lambda exc: legacy_draft_errors.append(str(exc)))
    legacy_draft_page.goto('http://gsf.test/index.html', wait_until='load')
    legacy_draft_page.evaluate("draft => localStorage.setItem('gsf-capstone-draft-chain-lightning-shock.v1', JSON.stringify(draft))", {
        'schemaVersion':1, 'challengeId':'chain-lightning-shock.v1',
        'resolve':{'mutatesState':False},
    })
    legacy_draft_page.goto('http://gsf.test/modules/runtime-reference.html', wait_until='load')
    legacy_draft_submission=json.loads(legacy_draft_page.locator('[data-capstone-editor]').input_value())
    check(legacy_draft_submission['resolve']['maxTargets'] is None and legacy_draft_submission['reaction']['retryPolicy'] is None,'capstone:legacy-draft-replaced-with-current-starter')
    check('이전 계약과 맞지 않는 draft를 지우고 최신 Starter' in legacy_draft_page.locator('[data-capstone-draft-status]').inner_text(),'capstone:legacy-draft-replacement-reported')
    check(legacy_draft_page.evaluate("localStorage.getItem('gsf-capstone-draft-chain-lightning-shock.v1')") is None,'capstone:legacy-draft-storage-cleared')
    check(not legacy_draft_errors,'capstone:legacy-draft-no-page-errors' + (f' ({legacy_draft_errors})' if legacy_draft_errors else ''))
    legacy_draft_context.close()

    if not RUNTIME_FILE:
        raise RuntimeError('site-map does not declare modules/runtime-reference.html')
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page(); runtime_errors=[]
    page.on('pageerror', lambda exc: runtime_errors.append(str(exc)))
    page.set_content(inline_page(RUNTIME_FILE), wait_until='load')
    page.wait_for_function("document.querySelector('[data-runtime-replay-status]')?.textContent === 'MATCH'")
    check(page.locator('[data-runtime-replay-status]').inner_text()=='MATCH','runtime:initial-replay-match')
    # The JSON lives inside a closed <details>; text_content reads the contract
    # without depending on whether that optional disclosure is expanded.
    initial_plan=json.loads(page.locator('[data-runtime-plan]').text_content() or '{}')
    check(initial_plan['outcome'].get('hitOutcome')=='Hit' and 'hit' not in initial_plan['outcome'],'runtime:plan-uses-hit-outcome')
    check(page.locator('[data-runtime-cache-status]').inner_text()=='PASS','runtime:cache-pass')
    check(page.locator('[data-runtime-migration-status]').inner_text()=='PASS','runtime:migration-pass')
    capstone_editor=page.locator('[data-capstone-editor]')
    check(capstone_editor.count()==1,'capstone:single-json-editor')
    starter_submission=json.loads(capstone_editor.input_value())
    check(starter_submission.get('challengeId')=='chain-lightning-shock.v1','capstone:starter-challenge-id')
    check(page.locator('[data-capstone-status]').inner_text()=='아직 채점하지 않았습니다.','capstone:initial-unassessed-state')
    page.locator('[data-capstone-assess]').click()
    check(page.locator('[data-capstone-score]').inner_text()=='0','capstone:starter-zero-score')
    check(page.locator('[data-capstone-status]').inner_text().startswith('NOT YET'),'capstone:starter-not-yet')
    check(all(page.locator(f'[data-capstone-gate="{name}"]').inner_text()=='FAIL' for name in ('normal','edge','failure')),'capstone:starter-three-gates-fail')
    check(int(page.locator('[data-capstone-critical-count]').inner_text())>0,'capstone:starter-critical-feedback')
    check(page.evaluate("typeof GSFCapstone.createReferenceSubmission === 'undefined'"),'capstone:no-public-completed-answer-api')
    array_shape_results=page.evaluate("""submission => {
      const copy = () => JSON.parse(JSON.stringify(submission));
      const sparse = copy();
      sparse.status.tickOffsets = new Array(2);
      sparse.status.tickOffsets[1] = 4;
      const extra = copy();
      extra.status.tickOffsets.extra = 'not-json-array-data';
      let tickGetterCalls = 0;
      const tickAccessor = copy();
      Object.defineProperty(tickAccessor.status.tickOffsets, '0', {
        enumerable: true,
        configurable: true,
        get() { tickGetterCalls += 1; return 2; }
      });
      let tokenGetterCalls = 0;
      const tokenAccessor = copy();
      Object.defineProperty(tokenAccessor.resolve.targetOrder, '0', {
        enumerable: true,
        configurable: true,
        get() { tokenGetterCalls += 1; return 'distanceBucket:asc'; }
      });
      const symbolExtra = copy();
      symbolExtra.resolve.targetOrder[Symbol('extra')] = 'not-json-array-data';
      return {
        sparseRejected: !GSFCapstone.assessCombatCapstone(sparse).schemaValid,
        extraRejected: !GSFCapstone.assessCombatCapstone(extra).schemaValid,
        tickAccessorRejected: !GSFCapstone.assessCombatCapstone(tickAccessor).schemaValid && tickGetterCalls === 0,
        tokenAccessorRejected: !GSFCapstone.assessCombatCapstone(tokenAccessor).schemaValid && tokenGetterCalls === 0,
        symbolRejected: !GSFCapstone.assessCombatCapstone(symbolExtra).schemaValid
      };
    }""", CAPSTONE_PASSING)
    check(array_shape_results['sparseRejected'],'capstone:direct-api-rejects-sparse-array')
    check(array_shape_results['extraRejected'],'capstone:direct-api-rejects-extra-array-property')
    check(array_shape_results['tickAccessorRejected'],'capstone:direct-api-rejects-tick-accessor-without-reading')
    check(array_shape_results['tokenAccessorRejected'],'capstone:direct-api-rejects-token-accessor-without-reading')
    check(array_shape_results['symbolRejected'],'capstone:direct-api-rejects-symbol-array-property')
    capstone_editor.fill(json.dumps(CAPSTONE_PASSING,ensure_ascii=False,indent=2))
    page.locator('[data-capstone-assess]').click()
    check(page.locator('[data-capstone-score]').inner_text()=='100','capstone:reference-score-100')
    check(page.locator('[data-capstone-status]').inner_text().startswith('PASS'),'capstone:reference-pass')
    check(page.locator('[data-capstone-meter]').evaluate('el => el.value')==100,'capstone:meter-reflects-score')
    check(all(page.locator(f'[data-capstone-gate="{name}"]').inner_text()=='PASS' for name in ('normal','edge','failure')),'capstone:reference-three-gates-pass')
    check(page.locator('[data-capstone-critical-count]').inner_text()=='0','capstone:reference-zero-critical')
    check(page.locator('[data-capstone-feedback] li[data-state="pass"]').count()==6,'capstone:six-rubric-dimensions-pass')
    capstone_evidence=json.loads(page.locator('[data-capstone-evidence]').inner_text())
    check(all(capstone_evidence[name]['passed'] for name in ('normal','edge','failure')),'capstone:computed-probe-evidence-pass')
    check(capstone_evidence['edge']['evidence']['firstPermutationHash']==capstone_evidence['edge']['evidence']['secondPermutationHash'],'capstone:permutation-hashes-match')
    stale_evidence=capstone_evidence['failure']['evidence']['staleCommit']
    check(stale_evidence['beforeStateHash']==stale_evidence['afterStateHash'] and stale_evidence['beforeOutboxHash']==stale_evidence['afterOutboxHash'],'capstone:stale-probe-hashes-unchanged')
    check('저장할 수 없지만 채점은 계속할 수 있습니다' in page.locator('[data-capstone-draft-status]').inner_text(),'capstone:blocked-storage-keeps-assessment-available')
    invalid_candidate=json.loads(json.dumps(CAPSTONE_PASSING))
    invalid_candidate['ownership']['orchestrationOwner']='Bogus'
    capstone_editor.fill(json.dumps(invalid_candidate,ensure_ascii=False,indent=2))
    page.locator('[data-capstone-assess]').click()
    check(page.locator('[data-capstone-status]').inner_text().startswith('SCHEMA FAIL'),'capstone:enum-outside-public-schema-rejected')
    check(json.loads(page.locator('[data-capstone-evidence]').inner_text())['schemaValid'] is False,'capstone:schema-error-evidence-visible')
    capstone_editor.fill('{')
    page.locator('[data-capstone-assess]').click()
    check(page.locator('[data-capstone-status]').inner_text().startswith('JSON PARSE FAIL'),'capstone:malformed-json-feedback')
    page.locator('[data-capstone-reset]').click()
    reset_submission=json.loads(capstone_editor.input_value())
    check(reset_submission.get('challengeId')=='chain-lightning-shock.v1' and reset_submission['resolve']['mutatesState'] is None,'capstone:reset-restores-starter')
    check('Starter로 초기화했습니다' in page.locator('[data-capstone-draft-status]').inner_text(),'capstone:reset-reports-draft-clear')
    mobile_capstone=context.new_page(); mobile_capstone.set_viewport_size({'width':390,'height':844})
    mobile_capstone.set_content(inline_page(RUNTIME_FILE), wait_until='load')
    mobile_capstone.wait_for_function("document.querySelector('[data-runtime-replay-status]')?.textContent === 'MATCH'")
    mobile_editor=mobile_capstone.locator('[data-capstone-editor]')
    mobile_editor.fill(json.dumps(CAPSTONE_PASSING,ensure_ascii=False,indent=2))
    mobile_capstone.locator('[data-capstone-assess]').click()
    check(mobile_capstone.locator('[data-capstone-status]').inner_text().startswith('PASS'),'capstone:mobile-reference-pass')
    check(all(mobile_capstone.locator(f'[data-capstone-gate="{name}"]').inner_text()=='PASS' for name in ('normal','edge','failure')),'capstone:mobile-three-gates-pass')
    mobile_overflow=mobile_capstone.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(mobile_overflow <= 1,'capstone:mobile-no-horizontal-overflow')
    check(json.loads(mobile_capstone.locator('[data-capstone-evidence]').inner_text())['failure']['passed'],'capstone:mobile-computed-evidence-visible')
    mobile_capstone.locator('[data-capstone-reset]').click()
    check(json.loads(mobile_editor.input_value())['resolve']['maxTargets'] is None,'capstone:mobile-reset-restores-expanded-starter')
    mobile_capstone.close()
    golden_run=page.evaluate('(input) => GSFRuntime.runFireballScenario(input)', GOLDEN['input'])
    expected=GOLDEN['expected']
    check(golden_run['replayHash']==expected['replayHash'],'runtime:golden-replay-hash')
    check(golden_run['traceHash']==expected['traceHash'],'runtime:golden-trace-hash')
    check(golden_run['resolution']['outcome']==expected['outcome'],'runtime:golden-outcome')
    check(golden_run['finalState']==expected['finalState'],'runtime:golden-final-state')
    check([event['type'] for event in golden_run['outbox']]==expected['eventTypes'],'runtime:golden-event-order')
    check(len(golden_run['trace'])==expected['traceCount'],'runtime:golden-trace-count')
    check(golden_run['invariants']==expected['invariants'],'runtime:golden-invariants')
    lethal_run=page.evaluate("(input) => GSFRuntime.runFireballScenario(input)", {
        **GOLDEN['input'],
        'target': {**GOLDEN['input']['target'], 'hp': 50, 'maxHp': 50},
    })
    check(lethal_run['resolution']['outcome']['finalHpDamage']==50,'runtime:lethal-hp-damage-capped')
    check(lethal_run['resolution']['outcome']['overkill']==112,'runtime:lethal-overkill-separated')
    check('StatusApplied' not in [event['type'] for event in lethal_run['outbox']],'runtime:lethal-target-skips-burn')
    source_ref_probe=page.evaluate("""() => {
      const system = GSFRuntime.createSourceRef({ kind: 'system', definitionId: 'system.combat' });
      let missingStatusInstance = null;
      try { GSFRuntime.createSourceRef({ kind: 'status', definitionId: 'status.burn' }); }
      catch (error) { missingStatusInstance = error.code; }
      return { system, missingStatusInstance };
    }""")
    check(source_ref_probe=={
        'system': {'kind': 'system', 'definitionId': 'system.combat'},
        'missingStatusInstance': 'INVALID_STRING',
    },'runtime:source-ref-instance-policy')
    for key in ('duplicate','conflict','rollback'):
        page.locator(f'[data-runtime-check="{key}"]').click()
        probe_text=page.locator(f'[data-runtime-check-output="{key}"]').inner_text()
        check(probe_text.startswith('PASS'),f'runtime:{key}-probe-pass')
        check('근거:' in probe_text and '학습 포인트:' in probe_text,f'runtime:{key}-probe-explains-result')
    page.locator('[data-runtime-key="rootSeed"]').fill('101')
    page.locator('[data-runtime-form] button[type="submit"]').click()
    check(page.locator('[data-runtime-replay-status]').inner_text()=='MATCH','runtime:changed-input-replay-match')
    check(page.locator('[data-runtime-trace] li').count()>=8,'runtime:trace-rendered')
    check(page.locator('[data-runtime-events] li').count()>=2,'runtime:events-rendered')
    check(not runtime_errors,'runtime:no-js-errors' + (f' ({runtime_errors})' if runtime_errors else ''))
    page.locator('[data-search-open]').first.click()
    check(page.locator('[data-command-palette]').evaluate('el => el.open'),'global-search:dialog-open')
    check(page.locator('#command-input').get_attribute('role')=='combobox','global-search:combobox-role')
    check(page.locator('#command-input').get_attribute('aria-expanded')=='true','global-search:expanded-state')
    check(page.locator('#command-input').get_attribute('aria-autocomplete')=='list','global-search:list-autocomplete')
    page.locator('#command-input').fill(RUNTIME_PAGE['title'])
    page.wait_for_timeout(80)
    runtime_results=page.locator('.command-result').filter(has_text=RUNTIME_PAGE['title'])
    check(runtime_results.count()>=1,'global-search:runtime-title-result')
    check(bool(page.locator('#command-result-status').inner_text()),'global-search:result-count-status')
    page.keyboard.press('Escape')
    page.wait_for_function("document.querySelector('#command-input')?.getAttribute('aria-expanded') === 'false'")
    check(page.locator('#command-input').get_attribute('aria-expanded')=='false','global-search:collapsed-state')
    page.evaluate('window.__printCalled=false; window.print=()=>{window.__printCalled=true}')
    page.locator('[data-print-page]').first.click()
    check(page.evaluate('window.__printCalled'),'print:data-print-page-listener')
    check(
        page.locator('.diagram > .diagram-preview').count()==page.locator('.diagram img.zoomable').count(),
        'diagram:inline-scroll-previews-ready',
    )
    page.locator('img.zoomable').first.click()
    check(page.locator('[data-diagram-modal]').evaluate('el => el.open'),'diagram:modal-open')
    page.wait_for_function("document.querySelector('[data-zoom-reset]')?.textContent !== '100%'")
    fit_label=page.locator('[data-zoom-reset]').inner_text()
    check(fit_label.endswith('%') and int(fit_label[:-1]) < 100,'diagram:fit-scale-is-real-percentage')
    page.locator('[data-zoom-reset]').click()
    check(page.locator('[data-zoom-reset]').inner_text()=='100%','diagram:one-click-native-scale')
    page.keyboard.press('Escape')

    gallery=context.new_page()
    gallery.set_content(inline_page('modules/diagram-gallery.html'),wait_until='load')
    gallery.wait_for_timeout(120)
    check(gallery.locator('.gallery .thumb').count()==34,'diagram-gallery:all-assets-listed')
    check(gallery.locator('.gallery .diagram-preview').count()==34,'diagram-gallery:scroll-previews-ready')
    wide=gallery.locator('img[alt="Effect 컴포넌트"]')
    check(wide.count()==1,'diagram-gallery:wide-diagram-present')
    wide.scroll_into_view_if_needed()
    gallery.wait_for_function("document.querySelector('img[alt=\"Effect 컴포넌트\"]')?.parentElement?.dataset.aspect === 'wide'")
    wide_preview=wide.locator('xpath=..')
    check(wide_preview.get_attribute('data-aspect')=='wide','diagram-gallery:wide-preview-classified')
    check(wide_preview.evaluate('el => el.scrollWidth > el.clientWidth'),'diagram-gallery:wide-preview-scrollable')
    wide.click()
    gallery.wait_for_function("document.querySelector('[data-zoom-reset]')?.textContent !== '100%'")
    wide_fit=gallery.locator('[data-zoom-reset]').inner_text()
    check(wide_fit.endswith('%') and int(wide_fit[:-1]) < 50,'diagram-gallery:wide-fit-scale-reported')
    gallery.locator('[data-zoom-reset]').click()
    check(gallery.locator('[data-zoom-reset]').inner_text()=='100%','diagram-gallery:wide-native-scale')
    gallery.keyboard.press('Escape')
    tall=gallery.locator('img[alt="Resolve · Commit · Reaction"]')
    check(tall.count()==1,'diagram-gallery:tall-diagram-present')
    tall.scroll_into_view_if_needed()
    gallery.wait_for_function("document.querySelector('img[alt=\"Resolve · Commit · Reaction\"]')?.parentElement?.dataset.aspect === 'tall'")
    tall_preview=tall.locator('xpath=..')
    check(tall_preview.evaluate('el => el.scrollHeight > el.clientHeight'),'diagram-gallery:tall-preview-scrollable')
    tall.click()
    gallery.wait_for_function("document.querySelector('[data-diagram-canvas]')?.classList.contains('is-panable')")
    check(gallery.locator('[data-diagram-canvas]').get_attribute('class').find('is-panable')>=0,'diagram-gallery:tall-native-view-panable')
    gallery.keyboard.press('Escape')
    gallery.close()
    context.close(); browser.close()

report={'status':'pass' if not errors else 'fail','checks':len(checks),'passed':sum(1 for item in checks if item['pass']),'errors':errors}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
