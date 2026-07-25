(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const body = document.body;
  const prefix = body?.dataset.prefix || '';
  const currentFile = body?.dataset.pageFile || 'index.html';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dialogOpeners = new WeakMap();

  const safeStorage = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (_) {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (_) {
        return false;
      }
    },
    available() {
      const key = '__gsf-storage-check__';
      try {
        localStorage.setItem(key, '1');
        localStorage.removeItem(key);
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  function normalise(value = '') {
    return String(value)
      .normalize('NFKC')
      .toLocaleLowerCase('ko-KR')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/[_/\\|·•—–-]+/g, ' ')
      .replace(/[^\p{L}\p{N}+#.% ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;inset:auto auto -1000px -1000px;opacity:0';
      document.body.appendChild(area);
      area.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        area.remove();
      }
    });
  }

  function closeDialog(dialog, returnFocus = true) {
    if (!dialog?.open) return;
    dialog.close();
    if (returnFocus) {
      const opener = dialogOpeners.get(dialog);
      if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
    }
  }

  function openDialog(dialog, opener = document.activeElement) {
    if (!dialog) return;
    $$('dialog[open]').forEach(other => {
      if (other !== dialog) closeDialog(other, false);
    });
    dialogOpeners.set(dialog, opener);
    if (!dialog.open) dialog.showModal();
  }

  function initialiseDialogs() {
    $$('[data-dialog-close]').forEach(button => {
      button.addEventListener('click', () => closeDialog(button.closest('dialog')));
    });

    $$('dialog').forEach(dialog => {
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeDialog(dialog);
      });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside || event.target === dialog) closeDialog(dialog);
      });
    });

    const drawer = $('[data-site-drawer]');
    $$('[data-menu-open]').forEach(button => {
      button.addEventListener('click', () => openDialog(drawer, button));
    });

    const tocDialog = $('[data-toc-dialog]');
    $$('[data-toc-open]').forEach(button => {
      button.addEventListener('click', () => openDialog(tocDialog, button));
    });
    $$('[data-toc-dialog] a').forEach(link => {
      link.addEventListener('click', () => closeDialog(tocDialog, false));
    });
  }

  function initialiseTheme() {
    const html = document.documentElement;
    const button = $('[data-theme-toggle]');
    const label = $('[data-theme-label]');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const order = ['system', 'light', 'dark'];
    const labels = { system: '시스템 테마', light: '라이트 테마', dark: '다크 테마' };

    function resolvedTheme(mode) {
      return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    }

    function apply(mode, persist = true) {
      const next = order.includes(mode) ? mode : 'system';
      const resolved = resolvedTheme(next);
      html.dataset.theme = next;
      html.classList.toggle('dark', resolved === 'dark');
      if (label) label.textContent = labels[next];
      if (button) {
        button.setAttribute('aria-label', `${labels[next]} 사용 중. 다음 테마로 전환`);
        button.dataset.themeState = next;
      }
      const themeMeta = $('meta[name="theme-color"]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
      themeMeta.content = resolved === 'dark' ? '#111319' : '#f5f5f2';
      if (persist) safeStorage.set('gsf-theme', next);
    }

    apply(safeStorage.get('gsf-theme', html.dataset.theme || 'system'), false);
    button?.addEventListener('click', () => {
      const current = html.dataset.theme || 'system';
      apply(order[(order.indexOf(current) + 1) % order.length]);
    });
    media.addEventListener?.('change', () => {
      if ((html.dataset.theme || 'system') === 'system') apply('system', false);
    });
  }

  function initialiseFocusMode() {
    const button = $('[data-focus-toggle]');
    if (!button) return;
    const saved = safeStorage.get('gsf-focus', 'off') === 'on';

    function apply(active, persist = true) {
      body.classList.toggle('is-focus', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? '집중 모드 종료' : '집중 모드 전환');
      if (persist) safeStorage.set('gsf-focus', active ? 'on' : 'off');
    }

    apply(saved, false);
    button.addEventListener('click', () => apply(!body.classList.contains('is-focus')));
  }

  function initialiseScrollProgress() {
    const bar = $('.scroll-progress span');
    if (!bar) return;
    let ticking = false;
    function update() {
      const root = document.documentElement;
      const max = Math.max(1, root.scrollHeight - root.clientHeight);
      const progress = Math.min(1, Math.max(0, root.scrollTop / max));
      bar.style.width = `${(progress * 100).toFixed(2)}%`;
      ticking = false;
    }
    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    addEventListener('scroll', requestUpdate, { passive: true });
    addEventListener('resize', requestUpdate, { passive: true });
    update();
  }

  function initialiseReadingTime() {
    const output = $('[data-reading-time]');
    const article = $('#article-content');
    if (!output || !article) return;

    function textUnits(text = '') {
      const compact = String(text).replace(/\s+/g, ' ').trim();
      if (!compact) return 0;
      const latinWords = (compact.match(/[A-Za-z0-9_+#.-]+/g) || []).length;
      const koreanChars = (compact.match(/[\uAC00-\uD7AF]/g) || []).length;
      const spacedWords = compact.split(/\s+/).filter(Boolean).length;
      const otherWords = Math.max(0, spacedWords - latinWords);
      return latinWords + otherWords + koreanChars / 2.4;
    }

    const clone = article.cloneNode(true);
    $$('pre, table, svg, .diagram, .doc-pager, dialog, button', clone).forEach(node => node.remove());

    const proseMinutes = textUnits(clone.textContent) / 220;
    const tableMinutes = $$('table', article)
      .reduce((total, table) => total + textUnits(table.textContent) / 120, 0);
    const codeMinutes = $$('pre', article).reduce((total, pre) => {
      const lines = pre.textContent.split(/\r?\n/).filter(line => line.trim()).length;
      return total + (lines ? Math.max(0.5, lines / 35) : 0);
    }, 0);
    const diagramMinutes = $$('.diagram', article).length * 0.75;
    const minutes = Math.max(1, Math.ceil(proseMinutes + tableMinutes + codeMinutes + diagramMinutes));

    output.textContent = `읽기 약 ${minutes}분 · 실습 별도`;
    output.title = '본문, 코드, 표, 다이어그램을 읽는 예상 시간이며 실습 시간은 포함하지 않습니다.';
  }

  function initialiseHeadingAnchors() {
    const article = $('#article-content');
    if (!article) return;
    $$('h2[id], h3[id]', article).forEach(heading => {
      if (heading.closest('a, button')) return;
      if ($('.heading-anchor', heading)) return;
      const headingTitle = heading.textContent.trim();
      if (!heading.hasAttribute('aria-label')) heading.setAttribute('aria-label', headingTitle);
      const button = document.createElement('button');
      button.className = 'heading-anchor';
      button.type = 'button';
      button.setAttribute('aria-label', `${headingTitle} 섹션 링크 복사`);
      button.title = '섹션 링크 복사';
      button.textContent = '#';
      button.addEventListener('click', async event => {
        event.stopPropagation();
        const url = `${location.href.split('#')[0]}#${encodeURIComponent(heading.id)}`;
        try {
          await copyText(url);
          history.replaceState(null, '', `#${heading.id}`);
          button.textContent = '✓';
          button.setAttribute('aria-label', '섹션 링크가 복사됨');
          setTimeout(() => {
            button.textContent = '#';
            button.setAttribute('aria-label', `${headingTitle} 섹션 링크 복사`);
          }, 1300);
        } catch (_) {
          location.hash = heading.id;
        }
      });
      heading.appendChild(button);
    });
  }

  function initialiseTocSpy() {
    const links = [...$$('.page-toc a'), ...$$('[data-toc-dialog] nav a')];
    const map = new Map();
    links.forEach(link => {
      const id = decodeURIComponent((link.getAttribute('href') || '').replace(/^#/, ''));
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(link);
    });
    const headings = [...map.keys()].map(id => document.getElementById(id)).filter(Boolean);
    if (!headings.length) return;

    function activate(id) {
      links.forEach(link => {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      });
      (map.get(id) || []).forEach(link => {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'location');
      });
    }

    if (!('IntersectionObserver' in window)) {
      activate(headings[0].id);
      return;
    }

    const visible = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visible.set(entry.target.id, entry));
      const candidates = headings
        .map(heading => visible.get(heading.id))
        .filter(entry => entry?.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
      if (candidates[0]) activate(candidates[0].target.id);
      else {
        const above = headings.filter(h => h.getBoundingClientRect().top < 180);
        activate((above.at(-1) || headings[0]).id);
      }
    }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.01, 1] });
    headings.forEach(heading => observer.observe(heading));
    activate((location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))))?.id || headings[0].id);
  }

  function inferCodeLabel(pre) {
    const code = $('code', pre);
    const className = code?.className || pre.className || '';
    const classMatch = className.match(/(?:language-|lang-)([\w#+.-]+)/i);
    if (classMatch) {
      const language = classMatch[1].toLowerCase();
      const labels = {
        csharp: 'C#',
        cs: 'C#',
        json: 'JSON',
        javascript: 'JavaScript',
        js: 'JavaScript',
        text: 'Trace / output',
        formula: 'Formula'
      };
      return labels[language] || classMatch[1];
    }
    const sample = (code?.textContent || pre.textContent || '').trim();
    if (/^(class|interface|enum|record|struct|public|private|protected|internal|using|namespace)\b/m.test(sample)) return 'C#';
    if (/^[\[{]/.test(sample)) return 'JSON';
    if (/^(GET|POST|PUT|PATCH|DELETE)\s+\//m.test(sample)) return 'api';
    if (/^[\w.-]+:\s/m.test(sample) && !/[;{}]/.test(sample)) return 'data / schema';
    return 'example';
  }

  function initialiseCodeBlocks() {
    $$('#article-content pre').forEach(pre => {
      if (pre.parentElement?.classList.contains('codewrap')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'codewrap';
      pre.before(wrapper);
      wrapper.appendChild(pre);

      const head = document.createElement('div');
      head.className = 'code-head';
      const label = document.createElement('span');
      label.textContent = inferCodeLabel(pre);
      const button = document.createElement('button');
      button.className = 'code-copy';
      button.type = 'button';
      button.textContent = '복사';
      button.setAttribute('aria-label', '코드 복사');
      button.addEventListener('click', async () => {
        try {
          await copyText(pre.innerText);
          button.textContent = '복사됨';
          button.setAttribute('aria-label', '코드가 복사됨');
        } catch (_) {
          button.textContent = '복사 실패';
        }
        setTimeout(() => {
          button.textContent = '복사';
          button.setAttribute('aria-label', '코드 복사');
        }, 1400);
      });
      head.append(label, button);
      wrapper.prepend(head);
    });
  }

  function initialiseArchitectureLens() {
    $$('[data-architecture-lens]').forEach((lens, lensIndex) => {
      const tabs = $$('[data-lens-tab]', lens);
      const views = $$('[data-lens-view]', lens);
      if (!tabs.length || !views.length) return;

      tabs.forEach((tab, index) => {
        const key = tab.dataset.lensTab;
        const panel = views.find(view => view.dataset.lensView === key);
        const tabId = `lens-${lensIndex}-tab-${key}`;
        const panelId = `lens-${lensIndex}-panel-${key}`;
        tab.id = tabId;
        tab.setAttribute('aria-controls', panelId);
        tab.tabIndex = index === 0 ? 0 : -1;
        if (panel) {
          panel.id = panelId;
          panel.setAttribute('aria-labelledby', tabId);
        }
      });

      function switchTo(key, focus = false) {
        const update = () => {
          tabs.forEach(tab => {
            const active = tab.dataset.lensTab === key;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active && focus) tab.focus();
          });
          views.forEach(view => {
            const active = view.dataset.lensView === key;
            view.classList.toggle('is-active', active);
            view.hidden = !active;
          });
        };
        update();
      }

      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => switchTo(tab.dataset.lensTab));
        tab.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          let next = index;
          if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = tabs.length - 1;
          switchTo(tabs[next].dataset.lensTab, true);
        });
      });
    });
  }

  function initialiseFilters() {
    $$('[data-filter]').forEach(input => {
      const group = document.querySelector(`[data-group="${CSS.escape(input.dataset.filter)}"]`);
      if (!group) return;
      const items = $$('[data-item]', group);
      const status = document.createElement('span');
      status.className = 'sr-only';
      status.setAttribute('aria-live', 'polite');
      input.insertAdjacentElement('afterend', status);

      function filter() {
        const query = normalise(input.value);
        const tokens = query.split(' ').filter(Boolean);
        let count = 0;
        items.forEach(item => {
          const haystack = normalise(item.dataset.item || item.textContent);
          const visible = tokens.every(token => haystack.includes(token));
          item.hidden = !visible;
          if (visible) count += 1;
        });
        status.textContent = query ? `${count}개 결과` : `${items.length}개 항목`;
      }
      input.addEventListener('input', filter);
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape' && input.value) {
          input.value = '';
          filter();
        }
      });
      filter();
    });
  }

  function subsequenceScore(query, value) {
    if (!query || !value) return 0;
    let qi = 0;
    let streak = 0;
    let score = 0;
    for (let i = 0; i < value.length && qi < query.length; i += 1) {
      if (value[i] === query[qi]) {
        qi += 1;
        streak += 1;
        score += 1 + streak * 0.35;
      } else {
        streak = 0;
      }
    }
    return qi === query.length ? score / Math.max(value.length, 1) : 0;
  }

  function scoreSearchEntry(entry, query) {
    const title = normalise(entry.title);
    const short = normalise(entry.short);
    const desc = normalise(entry.desc);
    const text = normalise(entry.text);
    const group = normalise(`${entry.group || ''} ${entry.level || ''}`);
    const haystack = `${title} ${short} ${desc} ${text} ${group}`;
    const tokens = query.split(' ').filter(Boolean);
    if (!tokens.length) return entry.type === 'page' ? 20 : 0;
    let score = 0;
    for (const token of tokens) {
      let tokenScore = 0;
      if (title === token) tokenScore = Math.max(tokenScore, 150);
      if (title.startsWith(token)) tokenScore = Math.max(tokenScore, 110);
      if (title.includes(token)) tokenScore = Math.max(tokenScore, 80);
      if (short.startsWith(token)) tokenScore = Math.max(tokenScore, 75);
      if (short.includes(token)) tokenScore = Math.max(tokenScore, 65);
      if (desc.includes(token)) tokenScore = Math.max(tokenScore, 42);
      if (text.includes(token)) tokenScore = Math.max(tokenScore, 30);
      if (group.includes(token)) tokenScore = Math.max(tokenScore, 20);
      if (!tokenScore && token.length > 1) {
        const fuzzy = Math.max(subsequenceScore(token, title), subsequenceScore(token, short));
        if (fuzzy > 0.08) tokenScore = 8 + fuzzy * 35;
      }
      if (!tokenScore) return 0;
      score += tokenScore;
    }
    if (entry.type === 'page') score += 100;
    if (entry.type === 'section' && entry.file === 'modules/diagram-gallery.html') score -= 25;
    if (entry.file === currentFile) score += 5;
    return score;
  }

  function compactDescription(value = '', maxLength = 132) {
    const compact = String(value).replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) return compact;
    const clipped = compact.slice(0, maxLength + 1);
    const wordBoundary = clipped.lastIndexOf(' ');
    return `${clipped.slice(0, wordBoundary > maxLength * 0.65 ? wordBoundary : maxLength).trim()}…`;
  }

  function initialiseCommandPalette() {
    const dialog = $('[data-command-palette]');
    const input = $('.command-input', dialog || document);
    const results = $('.command-results', dialog || document);
    const data = window.__GSF_SITE__ || {};
    const entries = Array.isArray(data.entries) ? data.entries : (Array.isArray(data.pages) ? data.pages.map(page => ({ ...page, type: 'page', anchor: '', text: page.key })) : []);
    if (!dialog || !input || !results) return;
    let activeIndex = 0;
    let currentResults = [];
    const siteOrder = new Map((Array.isArray(data.pages) ? data.pages : []).map((page, index) => [page.file, index]));
    const status = document.createElement('p');
    status.className = 'sr-only command-result-status';
    status.id = 'command-result-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    results.after(status);

    if (!results.id) results.id = 'command-results';
    results.setAttribute('role', 'listbox');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', results.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(status.id);
    input.setAttribute('aria-describedby', [...describedBy].join(' '));

    const commandKey = navigator.platform?.toLowerCase().includes('mac') ? '⌘ K' : 'Ctrl K';
    $$('.command-trigger kbd, .drawer-search kbd').forEach(kbd => { kbd.textContent = commandKey; });

    function hrefFor(entry) {
      const anchor = entry.anchor || '';
      if (entry.file === currentFile && anchor) return anchor;
      return `${prefix}${entry.file}${anchor}`;
    }

    function makeResult(entry, index) {
      const link = document.createElement('a');
      link.className = 'command-result';
      link.id = `command-option-${index}`;
      link.href = hrefFor(entry);
      link.setAttribute('role', 'option');
      link.setAttribute('aria-selected', String(index === activeIndex));
      link.dataset.index = String(index);

      const type = document.createElement('span');
      type.textContent = entry.type === 'section' ? entry.level || 'SECTION' : entry.level || 'PAGE';
      const copy = document.createElement('div');
      const title = document.createElement('b');
      title.textContent = entry.title || entry.short || 'Untitled';
      const description = document.createElement('small');
      description.textContent = compactDescription(entry.type === 'section'
        ? `${entry.short || ''}${entry.desc ? ` · ${entry.desc}` : ''}`
        : entry.desc || entry.group || '');
      copy.append(title, description);
      const arrow = document.createElement('i');
      arrow.textContent = '↵';
      link.append(type, copy, arrow);
      link.addEventListener('mouseenter', () => setActive(index, false));
      link.addEventListener('click', () => closeDialog(dialog, false));
      return link;
    }

    function setActive(index, scroll = true) {
      const options = $$('.command-result', results);
      if (!options.length) {
        activeIndex = 0;
        input.removeAttribute('aria-activedescendant');
        return;
      }
      activeIndex = Math.max(0, Math.min(index, options.length - 1));
      options.forEach((option, optionIndex) => {
        const active = optionIndex === activeIndex;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', String(active));
      });
      input.setAttribute('aria-activedescendant', options[activeIndex].id);
      if (scroll) options[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function render(value = '') {
      const query = normalise(value);
      currentResults = entries
        .map((entry, sourceIndex) => ({ entry, sourceIndex, score: scoreSearchEntry(entry, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => {
          if (!query) {
            const aOrder = Number.isFinite(a.entry.pageOrder) ? a.entry.pageOrder : (siteOrder.get(a.entry.file) ?? a.sourceIndex);
            const bOrder = Number.isFinite(b.entry.pageOrder) ? b.entry.pageOrder : (siteOrder.get(b.entry.file) ?? b.sourceIndex);
            return aOrder - bOrder;
          }
          return b.score - a.score ||
            ((a.entry.type === 'page') === (b.entry.type === 'page') ? 0 : (a.entry.type === 'page' ? -1 : 1)) ||
            (siteOrder.get(a.entry.file) ?? a.sourceIndex) - (siteOrder.get(b.entry.file) ?? b.sourceIndex) ||
            String(a.entry.title).localeCompare(String(b.entry.title), 'ko');
        })
        .slice(0, query ? 18 : 12)
        .map(item => item.entry);
      activeIndex = 0;
      results.replaceChildren();
      const resultSummary = query
        ? (currentResults.length ? `${currentResults.length}개의 검색 결과가 있습니다.` : '검색 결과가 없습니다.')
        : `${currentResults.length}개의 학습 페이지가 학습 순서대로 표시됩니다.`;
      status.textContent = resultSummary;
      results.setAttribute('aria-label', resultSummary);
      if (!currentResults.length) {
        const empty = document.createElement('p');
        empty.className = 'command-empty';
        empty.textContent = '일치하는 문서나 섹션이 없습니다. 다른 핵심 용어로 검색해 보세요.';
        results.appendChild(empty);
        input.removeAttribute('aria-activedescendant');
        return;
      }
      const fragment = document.createDocumentFragment();
      currentResults.forEach((entry, index) => fragment.appendChild(makeResult(entry, index)));
      results.appendChild(fragment);
      setActive(0, false);
    }

    function open(opener) {
      const drawer = $('[data-site-drawer]');
      if (drawer?.open) closeDialog(drawer, false);
      openDialog(dialog, opener);
      input.setAttribute('aria-expanded', 'true');
      input.value = '';
      render('');
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }

    $$('[data-search-open]').forEach(button => button.addEventListener('click', () => open(button)));
    dialog.addEventListener('close', () => {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog(dialog);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((activeIndex + 1) % Math.max(currentResults.length, 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((activeIndex - 1 + Math.max(currentResults.length, 1)) % Math.max(currentResults.length, 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActive(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActive(currentResults.length - 1);
      } else if (event.key === 'Enter' && currentResults[activeIndex]) {
        event.preventDefault();
        location.href = hrefFor(currentResults[activeIndex]);
        closeDialog(dialog, false);
      }
    });

    addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open(document.activeElement);
      } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey && !dialog.open) {
        event.preventDefault();
        open(document.activeElement);
      }
    });

    render('');
  }

  function initialiseDiagramViewer() {
    const dialog = $('[data-diagram-modal]');
    const canvas = $('[data-diagram-canvas]', dialog || document);
    const modalImage = $('img', canvas || dialog || document);
    const title = $('#diagram-modal-title');
    const original = $('[data-open-original]', dialog || document);
    const resetButton = $('[data-zoom-reset]', dialog || document);
    const zoomIn = $('[data-zoom-in]', dialog || document);
    const zoomOut = $('[data-zoom-out]', dialog || document);
    if (!dialog || !canvas || !modalImage) return;

    let scale = 1;
    let fitScale = 1;
    let isFitMode = true;
    let x = 0;
    let y = 0;
    let dragging = false;
    let pointerStart = null;

    function canPan() {
      if (!modalImage.naturalWidth || !modalImage.naturalHeight) return false;
      const availableWidth = Math.max(1, canvas.clientWidth - 48);
      const availableHeight = Math.max(1, canvas.clientHeight - 48);
      return modalImage.naturalWidth * scale > availableWidth + 1
        || modalImage.naturalHeight * scale > availableHeight + 1;
    }

    function applyTransform() {
      modalImage.style.left = `calc(50% + ${x}px)`;
      modalImage.style.top = `calc(50% + ${y}px)`;
      modalImage.style.transform = `translate(-50%, -50%) scale(${scale})`;
      canvas.classList.toggle('is-zoomed', scale > fitScale * 1.01);
      canvas.classList.toggle('is-panable', canPan());
      if (resetButton) {
        const atFit = Math.abs(scale - fitScale) < Math.max(.002, fitScale * .02);
        resetButton.textContent = `${Math.round(scale * 100)}%`;
        resetButton.setAttribute('aria-label', atFit ? '원본 크기 100%로 보기' : '화면에 맞춤');
        resetButton.title = atFit ? '원본 크기 100%로 보기' : '화면에 맞춤';
      }
    }

    function calculateFitScale() {
      if (!modalImage.naturalWidth || !modalImage.naturalHeight) return 1;
      const availableWidth = Math.max(1, canvas.clientWidth - 48);
      const availableHeight = Math.max(1, canvas.clientHeight - 48);
      const ratio = modalImage.naturalWidth / modalImage.naturalHeight;
      const fitAll = Math.min(1, availableWidth / modalImage.naturalWidth, availableHeight / modalImage.naturalHeight);
      if (ratio >= .75) return fitAll;
      return Math.min(1, availableWidth / modalImage.naturalWidth);
    }

    function defaultYFor(currentScale) {
      if (!modalImage.naturalWidth || !modalImage.naturalHeight) return 0;
      const ratio = modalImage.naturalWidth / modalImage.naturalHeight;
      const renderedHeight = modalImage.naturalHeight * currentScale;
      if (ratio >= .75 || renderedHeight <= canvas.clientHeight - 48) return 0;
      return 24 - canvas.clientHeight / 2 + renderedHeight / 2;
    }

    function reset() {
      fitScale = calculateFitScale();
      scale = fitScale;
      isFitMode = true;
      x = 0;
      y = defaultYFor(scale);
      dragging = false;
      applyTransform();
    }

    function setScale(next, originX = canvas.clientWidth / 2, originY = canvas.clientHeight / 2) {
      const previous = scale;
      const minimum = Math.max(.01, fitScale * .5);
      scale = Math.max(minimum, Math.min(8, next));
      if (scale === previous) return;
      isFitMode = false;
      const rect = canvas.getBoundingClientRect();
      const localX = originX - rect.left - rect.width / 2;
      const localY = originY - rect.top - rect.height / 2;
      const ratio = scale / previous;
      x = localX - (localX - x) * ratio;
      y = localY - (localY - y) * ratio;
      if (scale <= fitScale * 1.001) { x = 0; y = defaultYFor(scale); }
      applyTransform();
    }

    function toggleFitNative() {
      const atFit = Math.abs(scale - fitScale) < Math.max(.002, fitScale * .02);
      if (atFit || isFitMode) setScale(1);
      else reset();
    }

    function metadataFor(image) {
      const container = image.closest('.diagram, .thumb') || image.parentElement;
      const heading = container?.querySelector('.dh strong, h3, h2');
      const sourceLink = container?.querySelector('.da a[href$=".svg"], .da a[href$=".png"], a[href$=".svg"], a[href$=".png"]');
      const headingCopy = heading?.cloneNode(true);
      headingCopy?.querySelector('.heading-anchor')?.remove();
      return {
        title: headingCopy?.textContent.trim() || image.alt || 'Diagram',
        src: image.currentSrc || image.getAttribute('src'),
        original: sourceLink?.href || image.currentSrc || image.src
      };
    }

    function open(image) {
      const meta = metadataFor(image);
      if (!meta.src) return;
      modalImage.alt = image.alt || meta.title;
      if (title) title.textContent = meta.title;
      if (original) original.href = meta.original;
      openDialog(dialog, image);
      modalImage.src = meta.src;
      if (modalImage.complete && modalImage.naturalWidth) reset();
    }

    function prepareDiagramPreview(image) {
      const card = image.closest('.thumb, .diagram');
      if (!card || image.parentElement?.classList.contains('diagram-preview')) return;
      const preview = document.createElement('div');
      preview.className = 'diagram-preview';
      preview.tabIndex = 0;
      preview.setAttribute('role', 'region');
      preview.setAttribute('aria-label', `${image.alt || '다이어그램'} 스크롤 미리보기`);
      image.before(preview);
      preview.append(image);
      const classify = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        const ratio = image.naturalWidth / image.naturalHeight;
        preview.dataset.aspect = ratio > 2.2 ? 'wide' : ratio < .75 ? 'tall' : 'balanced';
        preview.style.setProperty('--preview-width', `${Math.min(image.naturalWidth, 2200)}px`);
        preview.style.setProperty('--preview-height', `${Math.min(image.naturalHeight, 2000)}px`);
        requestAnimationFrame(() => {
          const isWide = preview.dataset.aspect === 'wide';
          preview.scrollLeft = isWide ? Math.max(0, (preview.scrollWidth - preview.clientWidth) / 2) : 0;
          preview.scrollTop = 0;
        });
      };
      image.addEventListener('load', classify);
      if (image.complete) classify();
    }

    $$('img.zoomable, img[data-zoom]').forEach(image => {
      prepareDiagramPreview(image);
      image.tabIndex = image.tabIndex >= 0 ? image.tabIndex : 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `${image.alt || '다이어그램'} 크게 보기`);
      image.addEventListener('click', () => open(image));
      image.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open(image);
        }
      });
    });

    modalImage.addEventListener('load', reset);
    zoomIn?.addEventListener('click', () => setScale(scale * 1.35));
    zoomOut?.addEventListener('click', () => setScale(scale / 1.35));
    resetButton?.addEventListener('click', toggleFitNative);
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      setScale(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY);
    }, { passive: false });

    canvas.addEventListener('pointerdown', event => {
      if (!canPan() || event.button !== 0) return;
      dragging = true;
      pointerStart = { pointerX: event.clientX, pointerY: event.clientY, x, y };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', event => {
      if (!dragging || !pointerStart) return;
      x = pointerStart.x + event.clientX - pointerStart.pointerX;
      y = pointerStart.y + event.clientY - pointerStart.pointerY;
      applyTransform();
    });
    function endDrag(event) {
      dragging = false;
      pointerStart = null;
      canvas.classList.remove('is-dragging');
      if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('dblclick', toggleFitNative);
    modalImage.addEventListener('dragstart', event => event.preventDefault());
    dialog.addEventListener('close', () => {
      modalImage.removeAttribute('src');
      scale = 1;
      fitScale = 1;
      isFitMode = true;
      x = 0;
      y = 0;
      applyTransform();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === '+' || event.key === '=') setScale(scale * 1.35);
      if (event.key === '-') setScale(scale / 1.35);
      if (event.key === '0') reset();
      if (event.key === '1') setScale(1);
    });
    window.addEventListener('resize', () => { if (dialog.open && isFitMode) reset(); });
  }

  function initialiseCalculator() {
    const box = $('.calc');
    if (!box) return;
    if (!box.children.length) {
      const fields = [
        ['base', 'Base', 100],
        ['flat', 'Flat Add', 20],
        ['inc', 'PercentAdd %', 30],
        ['more', 'More %', 20],
        ['less', 'Less %', 0],
        ['override', 'Override (optional)', ''],
        ['min', 'Min Clamp', 0],
        ['clamp', 'Max Clamp', 9999]
      ];
      fields.forEach(([key, labelText, value]) => {
        const field = document.createElement('div');
        const id = `calc-${key}`;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = labelText;
        const input = document.createElement('input');
        input.id = id;
        input.type = 'number';
        input.inputMode = 'decimal';
        input.step = 'any';
        input.value = String(value);
        input.dataset.calcKey = key;
        field.append(label, input);
        box.appendChild(field);
      });
      const result = document.createElement('output');
      result.className = 'result';
      result.setAttribute('aria-live', 'polite');
      box.appendChild(result);
      const note = document.createElement('p');
      note.className = 'calc-note';
      note.textContent = 'Round(Clamp(Override ?? (base + flat) × (1 + percentAdd/100) × (1 + more/100) × (1 - less/100)), 2)';
      box.appendChild(note);
    }

    const result = $('.result', box);
    function calculate() {
      const values = {};
      $$('input[data-calc-key]', box).forEach(input => {
        const parsed = Number.parseFloat(input.value);
        values[input.dataset.calcKey] = Number.isFinite(parsed) ? parsed : null;
      });
      // 입력 percent point를 ratio로 바꾼 뒤 문서의 stage 순서를 그대로 따른다.
      const calculated = ((values.base ?? 0) + (values.flat ?? 0))
        * (1 + (values.inc ?? 0) / 100)
        * (1 + (values.more ?? 0) / 100)
        * (1 - (values.less ?? 0) / 100);
      const overridden = values.override ?? calculated;
      const clamped = Math.min(values.clamp ?? Number.POSITIVE_INFINITY, Math.max(values.min ?? Number.NEGATIVE_INFINITY, overridden));
      const finalValue = Math.round((clamped + Number.EPSILON) * 100) / 100;
      if (result) result.textContent = `Final Value = ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(finalValue)}`;
    }
    box.addEventListener('input', calculate);
    calculate();
  }

  function initialiseSteppers() {
    $$('.stepper').forEach(stepper => {
      const buttons = $$('.steps button', stepper);
      const panelTitle = $('.panel h3', stepper);
      const panelText = $('.panel p', stepper);
      if (!buttons.length || !panelTitle || !panelText) return;
      const records = buttons.map(button => ({
        title: button.dataset.title || button.textContent.trim(),
        text: button.dataset.description || button.getAttribute('aria-description') || ''
      }));
      function show(index, focus = false) {
        buttons.forEach((button, buttonIndex) => {
          const active = index === buttonIndex;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
          button.tabIndex = active ? 0 : -1;
        });
        panelTitle.textContent = records[index].title;
        if (records[index].text) panelText.textContent = records[index].text;
        if (focus) buttons[index].focus();
      }
      buttons.forEach((button, index) => {
        button.type = 'button';
        button.addEventListener('click', () => show(index));
        button.addEventListener('keydown', event => {
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          let next = index;
          if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
          if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = buttons.length - 1;
          show(next, true);
        });
      });
      show(0);
    });
  }

  function initialiseTableAccessibility() {
    const article = $('#article-content');
    if (!article) return;
    const headings = $$('h2[id], h3[id]', article);

    $$('table', article).forEach((table, index) => {
      let label = $('caption', table);
      if (label) {
        if (!label.id) label.id = `table-caption-${index + 1}`;
      } else {
        label = headings.filter(heading =>
          Boolean(heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
        ).at(-1);
      }

      if (!label) {
        label = document.createElement('caption');
        label.className = 'sr-only';
        label.id = `table-caption-${index + 1}`;
        label.textContent = `학습 자료 표 ${index + 1}`;
        table.prepend(label);
      }
      if (label.id) table.setAttribute('aria-labelledby', label.id);

      const headerRow = $('thead tr', table) || $('tr', table);
      $$('th', headerRow || table).forEach(cell => {
        if (!cell.hasAttribute('scope')) cell.setAttribute('scope', 'col');
      });
      $$('tbody tr', table).forEach(row => {
        const rowHeader = $(':scope > th', row);
        if (rowHeader && !headerRow?.contains(rowHeader) && !rowHeader.hasAttribute('scope')) {
          rowHeader.setAttribute('scope', 'row');
        }
      });
      $$('th:not([scope])', table).forEach(cell => {
        cell.setAttribute('scope', cell.closest('thead') ? 'col' : 'row');
      });
    });
  }

  function initialiseHorizontalScrollHints() {
    const article = $('#article-content');
    if (!article) return;

    const records = [];
    let printing = false;

    function descriptionTokens(node) {
      return (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    }

    function describe(node, id, enabled) {
      const tokens = descriptionTokens(node).filter(token => token !== id);
      if (enabled) tokens.push(id);
      if (tokens.length) node.setAttribute('aria-describedby', tokens.join(' '));
      else node.removeAttribute('aria-describedby');
    }

    function register(scroller, hint) {
      if (!scroller || !hint) return;
      scroller.dataset.horizontalScrollManaged = '';
      records.push({ scroller, hint });
    }

    $$('.codewrap', article).forEach((wrapper, index) => {
      const scroller = $('pre', wrapper);
      const label = $('.code-head > span', wrapper);
      if (!scroller || !label) return;

      let hint = $('[data-horizontal-scroll-hint="code"]', wrapper);
      if (!hint) {
        hint = document.createElement('small');
        hint.dataset.horizontalScrollHint = 'code';
        hint.id = `code-scroll-hint-${index + 1}`;
        hint.textContent = ' · 좌우로 스크롤';
        label.appendChild(hint);
      }
      register(scroller, hint);
    });

    $$('.table-scroll', article).forEach((wrapper, index) => {
      let hint = $('[data-horizontal-scroll-hint="table"]', wrapper);
      if (!hint) {
        hint = document.createElement('p');
        hint.dataset.horizontalScrollHint = 'table';
        hint.id = `table-scroll-hint-${index + 1}`;
        hint.textContent = '표 전체를 보려면 좌우로 스크롤하세요.';
        wrapper.prepend(hint);
      }
      register(wrapper, hint);
    });

    function update() {
      records.forEach(({ scroller, hint }) => {
        const overflow = scroller.scrollWidth > scroller.clientWidth + 1;
        const available = overflow && !printing;
        hint.hidden = !available;
        describe(scroller, hint.id, available);
        if (available) scroller.tabIndex = 0;
        else if (scroller.dataset.horizontalScrollManaged !== undefined) scroller.removeAttribute('tabindex');
      });
    }

    let scheduled = false;
    function requestUpdate() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        update();
      });
    }

    addEventListener('resize', requestUpdate, { passive: true });
    addEventListener('beforeprint', () => {
      printing = true;
      update();
    });
    addEventListener('afterprint', () => {
      printing = false;
      requestUpdate();
    });
    new MutationObserver(requestUpdate).observe(article, { childList: true, characterData: true, subtree: true });
    requestUpdate();
  }

  function initialisePrintAndImages() {
    $$('[data-print], [data-print-page], .print-page').forEach(button => button.addEventListener('click', () => print()));
    $$('#article-content img').forEach((image, index) => {
      if (!image.hasAttribute('decoding')) image.decoding = 'async';
      if (!image.hasAttribute('loading') && index > 0) image.loading = 'lazy';
    });
    addEventListener('beforeprint', () => {
      $$('#article-content img').forEach(image => image.loading = 'eager');
    });
  }

  function initialiseCurrentNavigation() {
    const current = currentFile.replace(/^\.\//, '');
    const navigationLinks = $$([
      '.top-nav a[href]',
      '.drawer-groups a[href]',
      '.mobile-bar a[href]',
      '.system-dock a[href]'
    ].join(','));

    navigationLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.removeAttribute('aria-current');
      link.classList.remove('is-active');
      if (!href || href.startsWith('#') || /^(?:https?:|mailto:|tel:|javascript:)/i.test(href)) return;
      const clean = href.split('#')[0]
        .replace(/^\.\//, '')
        .replace(/^(?:\.\.\/)+/, '');
      const matches = clean === current ||
        (current.startsWith('modules/') && `modules/${clean.replace(/^modules\//, '')}` === current);
      if (!matches) return;
      link.setAttribute('aria-current', 'page');
      link.classList.add('is-active');
    });
  }

  function initialiseLearningProgress() {
    const storageKey = 'gsf-learning-progress-v1';
    const learningPages = (window.__GSF_SITE__?.pages || [])
      .filter(page => Number.isInteger(page.learningOrder))
      .sort((left, right) => left.learningOrder - right.learningOrder);
    if (!learningPages.length) return;

    const learningFiles = new Set(learningPages.map(page => page.file));
    const currentLesson = learningPages.find(page => page.file === currentFile);
    const storageAvailable = safeStorage.available();

    function emptyState() {
      return { version: 1, completed: [], lastVisited: null };
    }

    function readState() {
      const raw = safeStorage.get(storageKey);
      if (!raw) return emptyState();
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed.completed)) throw new Error('unsupported learning state');
        const completed = [...new Set(parsed.completed.filter(file => learningFiles.has(file)))];
        const lastVisited = learningFiles.has(parsed.lastVisited) ? parsed.lastVisited : null;
        return { version: 1, completed, lastVisited };
      } catch (_) {
        safeStorage.remove(storageKey);
        return emptyState();
      }
    }

    function writeState(nextState) {
      return safeStorage.set(storageKey, JSON.stringify({
        version: 1,
        completed: learningPages.map(page => page.file).filter(file => nextState.completed.includes(file)),
        lastVisited: learningFiles.has(nextState.lastVisited) ? nextState.lastVisited : null
      }));
    }

    let state = readState();
    if (currentLesson && state.lastVisited !== currentLesson.file) {
      state = { ...state, lastVisited: currentLesson.file };
      writeState(state);
    }

    function nextLearningTarget() {
      const complete = new Set(state.completed);
      if (complete.size === learningPages.length) {
        return { file: 'modules/diagram-gallery.html', short: '다이어그램으로 복습하기' };
      }

      const lastIndex = learningPages.findIndex(page => page.file === state.lastVisited);
      if (lastIndex >= 0 && !complete.has(learningPages[lastIndex].file)) return learningPages[lastIndex];
      if (lastIndex >= 0) {
        const after = learningPages.slice(lastIndex + 1).find(page => !complete.has(page.file));
        if (after) return after;
      }
      return learningPages.find(page => !complete.has(page.file)) || learningPages[0];
    }

    const completionSection = currentLesson && $('#article-content') && $('.doc-pager')
      ? document.createElement('section')
      : null;

    if (completionSection) {
      completionSection.className = 'learning-completion';
      completionSection.dataset.learningCompletion = '';
      completionSection.setAttribute('aria-labelledby', 'learning-completion-title');
      completionSection.innerHTML = `
        <div>
          <span class="section-kicker">Learning progress</span>
          <h2 id="learning-completion-title">이 단원을 끝까지 읽었나요?</h2>
          <p><b data-learning-completion-name></b> 읽기 완료 표시는 현재 브라우저에만 저장되며 정답 여부나 숙달도를 뜻하지 않습니다.</p>
        </div>
        <div class="learning-completion-actions">
          <button aria-describedby="learning-completion-note" aria-pressed="false" class="button primary" data-learning-complete data-learning-toggle type="button">읽기 완료</button>
          <p aria-atomic="true" aria-live="polite" data-learning-status id="learning-completion-note" role="status"></p>
        </div>`;
      $('[data-learning-completion-name]', completionSection).textContent = currentLesson.short;
      $('.doc-pager').before(completionSection);
    }

    const completionButton = completionSection && $('[data-learning-complete]', completionSection);
    const completionStatus = completionSection && $('[data-learning-status]', completionSection);

    function renderCompletion() {
      if (!completionButton || !completionStatus) return;
      const complete = state.completed.includes(currentLesson.file);
      completionSection.dataset.state = complete ? 'complete' : 'incomplete';
      completionButton.setAttribute('aria-pressed', String(complete));
      completionButton.textContent = complete ? '읽기 완료 취소' : '읽기 완료';
      completionButton.setAttribute('aria-label', complete
        ? `${currentLesson.short} 읽기 완료 표시 취소`
        : `${currentLesson.short} 읽기 완료 표시`);
      completionButton.classList.toggle('primary', !complete);
      completionButton.classList.toggle('ghost', complete);
      if (!completionStatus.textContent) {
        completionStatus.textContent = storageAvailable
          ? complete
            ? `${currentLesson.short} 읽기 완료 표시가 이 브라우저에 저장되어 있습니다. 정답 여부나 숙달도와는 별개입니다.`
            : '읽기 완료 표시는 정답 공개와 별개로 직접 선택할 수 있으며 숙달도를 판정하지 않습니다.'
          : '이 환경에서는 읽기 진행 기록을 저장할 수 없습니다.';
      }
    }

    completionButton?.addEventListener('click', () => {
      const complete = state.completed.includes(currentLesson.file);
      const completed = complete
        ? state.completed.filter(file => file !== currentLesson.file)
        : [...state.completed, currentLesson.file];
      const nextState = { ...state, completed, lastVisited: currentLesson.file };
      if (!writeState(nextState)) {
        completionStatus.textContent = '이 환경에서는 읽기 진행 기록을 저장할 수 없습니다.';
        return;
      }
      state = nextState;
      completionStatus.textContent = complete
        ? `${currentLesson.short} 읽기 완료 표시를 취소했습니다.`
        : `${currentLesson.short} 읽기 완료 표시를 이 브라우저에 저장했습니다. 정답 여부나 숙달도와는 별개입니다.`;
      renderCompletion();
    });

    const progressPanel = $('[data-learning-progress]');
    const progressMeter = progressPanel && $('[data-learning-progress-meter]', progressPanel);
    const progressCount = progressPanel && $('[data-learning-progress-count]', progressPanel);
    const resumeLink = progressPanel && $('[data-learning-resume]', progressPanel);
    const resetButton = progressPanel && $('[data-learning-reset]', progressPanel);
    const progressStatus = progressPanel && $('[data-learning-progress-status]', progressPanel);

    function renderProgress() {
      if (!progressPanel || !progressMeter || !progressCount || !resumeLink || !resetButton || !progressStatus) return;
      const completedCount = state.completed.length;
      const target = nextLearningTarget();
      progressPanel.hidden = false;
      progressMeter.max = learningPages.length;
      progressMeter.value = completedCount;
      progressMeter.textContent = `${Math.round((completedCount / learningPages.length) * 100)}%`;
      progressMeter.setAttribute('aria-valuetext', `${learningPages.length}개 중 ${completedCount}개 읽기 완료`);
      progressCount.textContent = `${completedCount} / ${learningPages.length}`;
      resumeLink.href = `${prefix}${target.file}`;
      resumeLink.textContent = completedCount === learningPages.length
        ? target.short
        : state.completed.length || state.lastVisited ? `${target.short} 이어보기` : 'Core부터 시작';
      resetButton.disabled = completedCount === 0 && !state.lastVisited;
      if (!storageAvailable) progressStatus.textContent = '이 환경에서는 읽기 진행 기록을 저장할 수 없습니다.';
    }

    resetButton?.addEventListener('click', () => {
      if (!confirm('이 브라우저에 저장된 학습 경로 읽기 기록을 초기화할까요?')) return;
      if (!safeStorage.remove(storageKey)) {
        progressStatus.textContent = '이 환경에서는 읽기 진행 기록을 초기화할 수 없습니다.';
        return;
      }
      state = emptyState();
      progressStatus.textContent = '학습 경로 읽기 기록을 초기화했습니다.';
      renderProgress();
    });

    addEventListener('storage', event => {
      if (event.key !== storageKey) return;
      state = readState();
      if (completionStatus) completionStatus.textContent = '다른 탭에서 변경된 읽기 완료 표시를 반영했습니다.';
      if (progressStatus) progressStatus.textContent = '다른 탭에서 변경된 읽기 진행 기록을 반영했습니다.';
      renderCompletion();
      renderProgress();
    });

    renderCompletion();
    renderProgress();
  }

  function initialiseRuntimeReference() {
    const lab = $('[data-runtime-lab]');
    const G = window.GSFRuntime;
    if (!lab || !G) return;

    const format = value => new Intl.NumberFormat('ko-KR').format(value);
    const json = value => JSON.stringify(value, null, 2);
    const setText = (selector, value, root = document) => {
      const node = $(selector, root);
      if (node) node.textContent = String(value);
    };
    const numberValue = key => {
      const input = $(`[data-runtime-key="${key}"]`, lab);
      const value = Number(input?.value);
      return Number.isFinite(value) ? Math.trunc(value) : 0;
    };
    const percentBps = key => Math.max(0, Math.min(100, numberValue(key))) * 100;

    function inputFromForm() {
      const hp = Math.max(1, numberValue('targetHp'));
      const shield = Math.max(0, numberValue('shield'));
      return {
        rootSeed: Math.max(0, Math.min(0xffffffff, numberValue('rootSeed'))),
        caster: { spellPower: Math.max(0, numberValue('spellPower')) },
        target: {
          hp,
          maxHp: hp,
          shield,
          maxShield: Math.max(200, shield),
          fireResistanceBps: percentBps('resistancePercent')
        },
        skill: {
          hitChanceBps: percentBps('hitChancePercent'),
          critChanceBps: percentBps('critChancePercent')
        },
        burn: { ratioBps: percentBps('burnRatioPercent') },
        simulateStatusTicks: Boolean($('[data-runtime-key="simulateStatusTicks"]', lab)?.checked)
      };
    }

    function metric(label, value, detail = '') {
      const div = document.createElement('div');
      const span = document.createElement('span');
      const strong = document.createElement('strong');
      const small = document.createElement('small');
      span.textContent = label;
      strong.textContent = String(value);
      small.textContent = detail;
      div.append(span, strong, small);
      return div;
    }

    function renderReplay(result, replay) {
      const outcome = result.resolution.outcome;
      const target = result.finalState.entities[result.input.target.id];
      const metrics = $('[data-runtime-metrics]', lab);
      if (metrics) {
        metrics.replaceChildren(
          metric('Decision', outcome.hitOutcome === 'Hit' ? (outcome.critical ? 'CRITICAL' : 'HIT') : outcome.hitOutcome.toUpperCase(), `roll ${result.resolution.decisions.hitRollBps} / ${result.resolution.decisions.critRollBps}`),
          metric('Resolved', format(outcome.resolvedDamage), `raw ${format(outcome.rawDamage)}`),
          metric('Shield', format(outcome.shieldAbsorbed), `remaining ${format(target.resources.shield)}`),
          metric('HP damage', format(outcome.finalHpDamage), `impact HP ${format(outcome.targetHpAfter)}`),
          metric('Burn', format(result.outbox.filter(event => event.type === 'StatusTicked').reduce((sum, event) => sum + event.payload.finalHpDamage, 0)), `${result.statusAdvance.tickCount} committed ticks`),
          metric('Final HP', format(target.resources.hp), `${Object.keys(target.statuses).length} active status`)
        );
      }

      const replayOkay = replay.match && replay.traceMatch && replay.finalStateMatch;
      const status = $('[data-runtime-replay-status]', lab);
      if (status) {
        status.textContent = replayOkay ? 'MATCH' : 'DIVERGED';
        status.dataset.state = replayOkay ? 'pass' : 'fail';
      }
      setText('[data-runtime-replay-hash]', result.replayHash, lab);
      setText('[data-runtime-trace-hash]', result.traceHash, lab);
      setText('[data-runtime-trace-count]', `${result.trace.length} stages`, lab);
      const golden = $('[data-runtime-golden-hash]');
      if (golden) golden.textContent = `${result.replayHash.slice(0, 8)}…`;

      const traceList = $('[data-runtime-trace]', lab);
      if (traceList) {
        traceList.replaceChildren(...result.trace.map(record => {
          const li = document.createElement('li');
          const seq = document.createElement('span');
          const copy = document.createElement('div');
          const name = document.createElement('b');
          const detail = document.createElement('small');
          seq.textContent = String(record.sequence).padStart(2, '0');
          name.textContent = record.stage.replaceAll('_', ' ');
          detail.textContent = `tick ${record.tick} · ${Object.keys(record.payload || {}).slice(0, 3).join(' · ') || 'no payload'}`;
          copy.append(name, detail);
          li.append(seq, copy);
          return li;
        }));
      }

      const eventList = $('[data-runtime-events]', lab);
      if (eventList) {
        eventList.replaceChildren(...result.outbox.map((event, index) => {
          const li = document.createElement('li');
          const seq = document.createElement('span');
          const copy = document.createElement('div');
          const name = document.createElement('b');
          const detail = document.createElement('small');
          seq.textContent = String(index + 1).padStart(2, '0');
          name.textContent = event.type;
          detail.textContent = `tick ${event.occurredTick} · ${event.eventId.slice(-8)}`;
          copy.append(name, detail);
          li.append(seq, copy);
          return li;
        }));
      }
      setText('[data-runtime-plan]', json({ decisions: result.resolution.decisions, outcome, plan: result.resolution.plan }), lab);
      setText('[data-runtime-state]', json(result.finalState), lab);
    }

    function runReplay() {
      try {
        const input = inputFromForm();
        const result = G.runFireballScenario(input);
        const replay = G.verifyReplay(input);
        renderReplay(result, replay);
      } catch (error) {
        const status = $('[data-runtime-replay-status]', lab);
        if (status) {
          status.textContent = error.code || 'ERROR';
          status.dataset.state = 'fail';
        }
        setText('[data-runtime-plan]', json(error.toJSON ? error.toJSON() : { message: String(error) }), lab);
      }
    }

    const form = $('[data-runtime-form]', lab);
    form?.addEventListener('submit', event => {
      event.preventDefault();
      runReplay();
    });
    form?.addEventListener('reset', () => requestAnimationFrame(runReplay));

    function stateHash(value) {
      return G.hashHex(value).slice(0, 12);
    }

    const probes = {
      duplicate: () => {
        const result = G.demonstrateDuplicateCommand(inputFromForm());
        const pass = result.duplicateDetected && result.stateUnchanged;
        const beforeHash = stateHash(result.before);
        const afterHash = stateHash(result.after);
        return {
          pass,
          code: result.error?.code || 'NO_ERROR',
          summary: pass ? '중복 command를 거부해 두 번째 비용·피해·이벤트가 발생하지 않았습니다.' : '중복 command 처리 뒤 상태가 달라졌습니다.',
          evidence: `실행 전후 상태 해시 ${beforeHash} → ${afterHash}${result.stateUnchanged ? '로 동일합니다.' : '로 변경됐습니다.'}`,
          point: '같은 commandId는 재전송되어도 정확히 한 번만 반영돼야 합니다.'
        };
      },
      conflict: () => {
        const result = G.demonstrateVersionConflict(inputFromForm());
        const pass = result.rejected && result.noPartialMutation;
        const beforeHash = stateHash(result.before);
        const afterHash = stateHash(result.after);
        return {
          pass,
          code: result.error?.code || 'NO_ERROR',
          summary: pass ? '외부 변경 뒤 stale plan을 거부해 추가 mutation과 event를 남기지 않았습니다.' : 'stale plan이 최신 상태를 변경했습니다.',
          evidence: `외부 변경 반영 상태와 거부 후 상태 해시가 ${beforeHash} → ${afterHash}${result.noPartialMutation ? '로 동일합니다.' : '로 달라졌습니다.'}`,
          point: 'expectedVersion 사전 조건은 동시 변경을 오래된 계산으로 덮어쓰지 못하게 합니다.'
        };
      },
      rollback: () => {
        const result = G.demonstrateAtomicRollback(inputFromForm());
        const beforeHash = stateHash(result.before);
        const afterHash = stateHash(result.after);
        return {
          pass: result.rolledBack,
          code: result.error?.code || 'NO_ERROR',
          summary: result.rolledBack ? '유효한 첫 operation까지 포함해 working copy 전체를 폐기했습니다.' : '실패 전에 실행한 일부 operation이 상태에 남았습니다.',
          evidence: `commit 전후 상태 해시 ${beforeHash} → ${afterHash}${result.rolledBack ? '로 동일합니다.' : '로 변경됐습니다.'}`,
          point: '모든 operation과 invariant가 성공한 경우에만 state와 outbox를 함께 확정해야 합니다.'
        };
      }
    };
    $$('[data-runtime-check]', document).forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.runtimeCheck;
        const output = $(`[data-runtime-check-output="${key}"]`);
        try {
          const result = probes[key]();
          if (output) {
            output.textContent = `${result.pass ? 'PASS' : 'FAIL'} · ${result.code} — ${result.summary} 근거: ${result.evidence} 학습 포인트: ${result.point}`;
            output.dataset.state = result.pass ? 'pass' : 'fail';
          }
        } catch (error) {
          if (output) {
            output.textContent = `ERROR · ${error.code || error.message} — probe를 완료하지 못했습니다. 입력과 콘솔 오류를 확인하세요.`;
            output.dataset.state = 'fail';
          }
        }
      });
    });

    function runCacheProbe() {
      const root = $('[data-runtime-cache-probe]');
      if (!root) return;
      const cache = new G.ContextualStatCache({ maxEntries: 8 });
      let computes = 0;
      const evaluate = context => cache.evaluate({
        entityId: 'entity.caster',
        statId: 'stat.fire-damage',
        ownerVersion: 7,
        dependencies: ['target.id', 'target.tags', 'distanceBand'],
        context,
        compute: () => {
          computes += 1;
          return 100 + (context.target.tags.includes('status.burning') ? 30 : 0) + (context.distanceBand === 'far' ? 20 : 0);
        }
      });
      const firstContext = { target: { id: 'entity.target-a', tags: ['status.burning'] }, distanceBand: 'far' };
      const first = evaluate(firstContext);
      const repeated = evaluate({ distanceBand: 'far', target: { tags: ['status.burning'], id: 'entity.target-a' } });
      const other = evaluate({ target: { id: 'entity.target-b', tags: [] }, distanceBand: 'near' });
      const pattern = [first, repeated, other].map(item => item.cacheHit ? 'HIT' : 'MISS').join(' → ');
      setText('[data-runtime-cache-status]', pattern === 'MISS → HIT → MISS' ? 'PASS' : 'FAIL', root);
      const status = $('[data-runtime-cache-status]', root);
      if (status) status.dataset.state = pattern === 'MISS → HIT → MISS' ? 'pass' : 'fail';
      setText('[data-runtime-cache-pattern]', pattern, root);
      setText('[data-runtime-cache-computes]', computes, root);
      setText('[data-runtime-cache-values]', [first.value, repeated.value, other.value].join(' · '), root);
      setText('[data-runtime-cache-fingerprint]', first.fingerprint.hash, root);
      setText('[data-runtime-cache-details]', json({ dependencies: first.fingerprint.dependencies, first: { cacheHit: first.cacheHit, cacheKey: first.cacheKey, value: first.value }, repeated: { cacheHit: repeated.cacheHit, cacheKey: repeated.cacheKey, value: repeated.value }, otherTarget: { cacheHit: other.cacheHit, cacheKey: other.cacheKey, value: other.value }, cache: cache.stats() }), root);
    }
    $('[data-runtime-cache-run]')?.addEventListener('click', runCacheProbe);

    function runMigrationProbe() {
      const root = $('[data-runtime-migration-probe]');
      if (!root) return;
      const source = { schemaVersion: 1, playerId: 'player.demo', profile: { displayName: 'Aria' }, resources: { health: 420, mana: 95 }, inventory: ['item.ember-ring'] };
      const registry = new G.SchemaMigrationRegistry({ currentVersion: 3, minimumSupportedVersion: 1 });
      registry.register({ migrationId: 'migration.player.v1-v2', fromVersion: 1, toVersion: 2, migrate: document => ({ ...document, schemaVersion: 2, resources: { hp: document.resources.health, mana: document.resources.mana } }) });
      registry.register({ migrationId: 'migration.player.v2-v3', fromVersion: 2, toVersion: 3, migrate: document => ({ schemaVersion: 3, playerId: document.playerId, profile: document.profile, resources: document.resources, inventory: document.inventory, migratedAtPolicy: 'logical-version-only' }) });
      try {
        const before = G.canonicalStringify(source);
        const result = registry.migrate(source);
        const sourceUnchanged = before === G.canonicalStringify(source);
        setText('[data-runtime-migration-status]', sourceUnchanged && result.appliedMigrations.length === 2 ? 'PASS' : 'FAIL', root);
        const status = $('[data-runtime-migration-status]', root);
        if (status) status.dataset.state = sourceUnchanged ? 'pass' : 'fail';
        setText('[data-runtime-migration-before]', json(source), root);
        setText('[data-runtime-migration-after]', json(result.document), root);
        const list = $('[data-runtime-migration-audit]', root);
        if (list) list.replaceChildren(...result.appliedMigrations.map(step => {
          const li = document.createElement('li');
          const title = document.createElement('b');
          const hashes = document.createElement('code');
          title.textContent = `${step.migrationId} · v${step.fromVersion} → v${step.toVersion}`;
          hashes.textContent = `${step.beforeHash} → ${step.afterHash}`;
          li.append(title, hashes);
          return li;
        }));
      } catch (error) {
        setText('[data-runtime-migration-status]', error.code || 'ERROR', root);
      }
    }
    $('[data-runtime-migration-run]')?.addEventListener('click', runMigrationProbe);

    runReplay();
    runCacheProbe();
    runMigrationProbe();
  }

  function initialiseCapstoneAssessor() {
    const root = $('[data-capstone-lab]');
    const C = window.GSFCapstone;
    if (!root || !C) return;

    const editor = $('[data-capstone-editor]', root);
    const assessButton = $('[data-capstone-assess]', root);
    const resetButton = $('[data-capstone-reset]', root);
    const score = $('[data-capstone-score]', root);
    const meter = $('[data-capstone-meter]', root);
    const status = $('[data-capstone-status]', root);
    const criticalCount = $('[data-capstone-critical-count]', root);
    const draftStatus = $('[data-capstone-draft-status]', root);
    const feedback = $('[data-capstone-feedback]', root);
    const evidence = $('[data-capstone-evidence]', root);
    const storageKey = `gsf-capstone-draft-${C.CHALLENGE_ID}`;
    const starter = JSON.stringify(C.createStarterSubmission(), null, 2);
    const storageAvailable = safeStorage.available();
    const storedDraft = safeStorage.get(storageKey);
    let loadableDraft = null;
    let discardedInvalidDraft = false;
    if (storedDraft !== null) {
      try {
        const parsedDraft = JSON.parse(storedDraft);
        if (storedDraft.length <= C.MAX_SUBMISSION_CHARS && C.assessCombatCapstone(parsedDraft).schemaValid) {
          loadableDraft = storedDraft;
        } else {
          discardedInvalidDraft = true;
          safeStorage.remove(storageKey);
        }
      } catch {
        discardedInvalidDraft = true;
        safeStorage.remove(storageKey);
      }
    }
    let saveTimer = 0;

    function setGate(name, passed, pending = false) {
      const node = $(`[data-capstone-gate="${name}"]`, root);
      if (!node) return;
      node.textContent = pending ? '대기' : passed ? 'PASS' : 'FAIL';
      if (pending) delete node.dataset.state;
      else node.dataset.state = passed ? 'pass' : 'fail';
    }

    function resetAssessment(message = '아직 채점하지 않았습니다.') {
      if (score) score.textContent = '—';
      if (meter) {
        meter.value = 0;
        meter.textContent = '0 / 100';
      }
      if (status) {
        status.textContent = message;
        delete status.dataset.state;
      }
      if (criticalCount) {
        criticalCount.textContent = '—';
        delete criticalCount.dataset.state;
      }
      for (const name of ['normal', 'edge', 'failure']) setGate(name, false, true);
      if (evidence) evidence.textContent = '{}';
      if (feedback) {
        const item = document.createElement('li');
        item.textContent = '설계를 채점하면 배점과 빠진 계약이 여기에 표시됩니다.';
        feedback.replaceChildren(item);
      }
    }

    function renderSchemaError(message, details = []) {
      if (score) score.textContent = '0';
      if (meter) {
        meter.value = 0;
        meter.textContent = '0 / 100';
      }
      if (status) {
        status.textContent = message;
        status.dataset.state = 'fail';
      }
      if (criticalCount) {
        criticalCount.textContent = '1';
        criticalCount.dataset.state = 'fail';
      }
      for (const name of ['normal', 'edge', 'failure']) setGate(name, false);
      if (evidence) evidence.textContent = JSON.stringify({ schemaValid: false, errors: details.slice(0, 3) }, null, 2);
      if (!feedback) return;
      const item = document.createElement('li');
      const title = document.createElement('strong');
      const copy = document.createElement('small');
      title.textContent = '제출 형식 확인';
      copy.textContent = details.length ? details.slice(0, 3).join(' ') : message;
      item.dataset.state = 'fail';
      item.append(title, copy);
      feedback.replaceChildren(item);
    }

    function renderAssessment(result) {
      if (!result.schemaValid) {
        renderSchemaError('SCHEMA FAIL · 고정 JSON 계약을 확인하세요.', result.schemaErrors);
        return;
      }
      const passedGates = Object.values(result.gates).filter(Boolean).length;
      const passedDimensions = result.criteria.filter(criterion => criterion.pass).length;
      if (score) score.textContent = String(result.score);
      if (meter) {
        meter.value = result.score;
        meter.textContent = `${result.score} / 100`;
      }
      if (status) {
        status.textContent = result.passed
          ? `PASS · ${result.score}/100 · dimension 6/6 · gate 3/3 · critical 0`
          : `NOT YET · ${result.score}/100 · dimension ${passedDimensions}/6 · gate ${passedGates}/3 · critical ${result.criticalViolations.length}`;
        status.dataset.state = result.passed ? 'pass' : 'fail';
      }
      if (criticalCount) {
        criticalCount.textContent = String(result.criticalViolations.length);
        criticalCount.dataset.state = result.criticalViolations.length === 0 ? 'pass' : 'fail';
      }
      for (const name of ['normal', 'edge', 'failure']) setGate(name, result.gates[name]);
      if (evidence) {
        const visibleEvidence = Object.fromEntries(Object.entries(result.probes).map(([name, probe]) => [name, {
          passed: probe.passed,
          failedChecks: probe.checks.filter(check => !check.pass).map(check => check.id),
          evidence: probe.evidence
        }]));
        evidence.textContent = JSON.stringify(visibleEvidence, null, 2);
      }
      if (!feedback) return;

      // 사용자 문자열은 HTML로 해석하지 않고 항목별 안전한 text node로만 그린다.
      const items = result.criteria.map(criterion => {
        const item = document.createElement('li');
        const head = document.createElement('div');
        const title = document.createElement('strong');
        const points = document.createElement('b');
        const detail = document.createElement('small');
        const failures = criterion.checks.filter(check => !check.pass);
        title.textContent = criterion.label;
        points.textContent = `${criterion.score} / ${criterion.maxScore} · min ${criterion.minimumScore}`;
        detail.textContent = failures.length === 0
          ? '모든 rubric check를 충족했습니다.'
          : `${criterion.pass ? '차원 최소점 충족 · 추가 보완' : '차원 최소점 미달 · 보완'}: ${failures.map(check => check.label).join(' · ')}`;
        item.dataset.state = failures.length === 0 ? 'pass' : 'fail';
        head.append(title, points);
        item.append(head, detail);
        return item;
      });
      if (result.criticalViolations.length) {
        const item = document.createElement('li');
        const head = document.createElement('div');
        const title = document.createElement('strong');
        const points = document.createElement('b');
        const detail = document.createElement('small');
        title.textContent = 'Critical gate';
        points.textContent = `${result.criticalViolations.length} violation`;
        detail.textContent = result.criticalViolations.map(item => item.label).join(' · ');
        item.dataset.state = 'fail';
        head.append(title, points);
        item.append(head, detail);
        items.unshift(item);
      }
      feedback.replaceChildren(...items);
    }

    function saveDraft() {
      if (!storageAvailable) {
        if (draftStatus) draftStatus.textContent = '이 환경에서는 draft를 저장할 수 없지만 채점은 계속할 수 있습니다.';
        return false;
      }
      const saved = safeStorage.set(storageKey, editor.value);
      if (draftStatus) draftStatus.textContent = saved ? '이 브라우저에 draft를 저장했습니다.' : 'draft를 저장하지 못했습니다.';
      return saved;
    }

    editor.value = loadableDraft ?? starter;
    if (draftStatus) {
      draftStatus.textContent = discardedInvalidDraft
        ? '이전 계약과 맞지 않는 draft를 지우고 최신 Starter를 불러왔습니다.'
        : loadableDraft !== null
        ? '이 브라우저에 저장된 draft를 불러왔습니다.'
        : storageAvailable ? 'Starter를 불러왔습니다. 변경 내용은 이 브라우저에만 저장됩니다.' : 'Starter를 불러왔습니다. 이 환경에서는 draft를 저장할 수 없습니다.';
    }

    // 입력 중 저장 횟수를 줄이되 마지막 draft는 짧은 지연 뒤 반영한다.
    editor.addEventListener('input', () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveDraft, 180);
    });
    assessButton?.addEventListener('click', () => {
      window.clearTimeout(saveTimer);
      saveDraft();
      if (editor.value.length > C.MAX_SUBMISSION_CHARS) {
        renderSchemaError(`SIZE FAIL · ${C.MAX_SUBMISSION_CHARS.toLocaleString('ko-KR')}자 이하로 줄이세요.`);
        return;
      }
      try {
        renderAssessment(C.assessCombatCapstone(JSON.parse(editor.value)));
      } catch (error) {
        renderSchemaError('JSON PARSE FAIL · 문법을 확인하세요.', [String(error.message || error)]);
      }
    });
    resetButton?.addEventListener('click', () => {
      window.clearTimeout(saveTimer);
      editor.value = starter;
      safeStorage.remove(storageKey);
      if (draftStatus) draftStatus.textContent = '저장된 draft를 지우고 Starter로 초기화했습니다.';
      resetAssessment('Starter로 초기화했습니다. 아직 채점하지 않았습니다.');
      editor.focus();
    });

    resetAssessment();
  }

  initialiseDialogs();
  initialiseTheme();
  initialiseFocusMode();
  initialiseScrollProgress();
  initialiseReadingTime();
  initialiseHeadingAnchors();
  initialiseTocSpy();
  initialiseCodeBlocks();
  initialiseArchitectureLens();
  initialiseFilters();
  initialiseCommandPalette();
  initialiseDiagramViewer();
  initialiseCalculator();
  initialiseSteppers();
  initialiseTableAccessibility();
  initialiseHorizontalScrollHints();
  initialisePrintAndImages();
  initialiseCurrentNavigation();
  initialiseLearningProgress();
  initialiseRuntimeReference();
  initialiseCapstoneAssessor();
})();
