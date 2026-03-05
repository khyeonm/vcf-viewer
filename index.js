// AutoPipe Plugin: vcf-viewer
// Variant Call Format viewer with colored bases, metadata, and server-side pagination
// Supported extensions: vcf

(function () {
  var PAGE_SIZE = 100;
  var _container = null;
  var _metaCache = {};

  // ── Inject scoped styles ──
  var styleId = '__vcf_viewer_style__';
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent =
      '.vcf-viewer { overflow: auto; }' +
      '.vcf-viewer table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: auto; }' +
      '.vcf-viewer th { background: #f5f5f5; padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e5e5; position: sticky; top: 0; white-space: nowrap; }' +
      '.vcf-viewer td { padding: 6px 12px; border-bottom: 1px solid #f0f0f0; font-family: "SF Mono","Fira Code","Consolas",monospace; font-size: 12px; white-space: nowrap; }' +
      '.vcf-viewer tr:hover td { background: #f0f7ff; }' +
      '.vcf-viewer .vcf-meta { font-size: 12px; color: #666; margin-bottom: 12px; }' +
      '.vcf-viewer .vcf-seq { font-family: "SF Mono",monospace; font-size: 11px; letter-spacing: 1px; }' +
      '.vcf-viewer .base-A { color: #2ecc71; font-weight: 600; }' +
      '.vcf-viewer .base-T { color: #e74c3c; font-weight: 600; }' +
      '.vcf-viewer .base-C { color: #3498db; font-weight: 600; }' +
      '.vcf-viewer .base-G { color: #f39c12; font-weight: 600; }' +
      '.vcf-viewer .vcf-pagination { display: flex; align-items: center; gap: 8px; padding: 10px 0; justify-content: center; font-size: 13px; color: #666; }' +
      '.vcf-viewer .vcf-pagination button { padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px; background: #f8f8f8; cursor: pointer; font-size: 12px; }' +
      '.vcf-viewer .vcf-pagination button:hover { background: #eee; }' +
      '.vcf-viewer .vcf-pagination button:disabled { color: #ccc; cursor: not-allowed; background: #fafafa; }';
    document.head.appendChild(style);
  }

  function colorBases(seq) {
    return seq.replace(/[ATCGN]/gi, function (b) {
      var u = b.toUpperCase();
      if (u === 'A') return '<span class="base-A">' + b + '</span>';
      if (u === 'T') return '<span class="base-T">' + b + '</span>';
      if (u === 'C') return '<span class="base-C">' + b + '</span>';
      if (u === 'G') return '<span class="base-G">' + b + '</span>';
      return b;
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function fetchPage(name, page) {
    var resp = await fetch(
      '/data/' + encodeURIComponent(name) + '?page=' + page + '&page_size=' + PAGE_SIZE
    );
    return await resp.json();
  }

  function renderTable(name, headers, rows, total, page) {
    var totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    var html = '<table><tr>';
    headers.forEach(function (h) {
      html += '<th>' + escapeHtml(h) + '</th>';
    });
    html += '</tr>';
    rows.forEach(function (rec) {
      html += '<tr>';
      rec.forEach(function (val, i) {
        if (headers[i] === 'REF' || headers[i] === 'ALT') {
          html += '<td class="vcf-seq">' + colorBases(escapeHtml(val)) + '</td>';
        } else {
          html += '<td>' + escapeHtml(val) + '</td>';
        }
      });
      html += '</tr>';
    });
    html += '</table>';

    if (totalPages > 1) {
      var safeName = name.replace(/'/g, "\\'");
      html += '<div class="vcf-pagination">';
      html +=
        '<button onclick="window._vcfPluginPaginate(\'' +
        safeName + "'," + (page - 1) + ')"' +
        (page <= 0 ? ' disabled' : '') +
        '>&laquo; Prev</button>';
      html +=
        '<span>Page ' + (page + 1) + ' / ' + totalPages +
        ' (' + total.toLocaleString() + ' rows)</span>';
      html +=
        '<button onclick="window._vcfPluginPaginate(\'' +
        safeName + "'," + (page + 1) + ')"' +
        (page >= totalPages - 1 ? ' disabled' : '') +
        '>Next &raquo;</button>';
      html += '</div>';
    }
    return html;
  }

  async function renderPage(name, page) {
    if (!_container) return;
    // When in IGV+tab mode, target the #__plugin_content__ div if it exists
    var target = _container.querySelector('#__plugin_content__') || _container;

    if (page > 0) {
      target.innerHTML = '<div class="vcf-viewer"><p class="vcf-meta">Loading page...</p></div>';
    }

    var data = await fetchPage(name, page);
    if (data.error) {
      target.innerHTML =
        '<div class="vcf-viewer"><p style="color:red">Error: ' + escapeHtml(data.error) + '</p></div>';
      return;
    }

    // Cache metadata from first page
    if (page === 0 && data.meta) {
      _metaCache[name] = { meta: data.meta, col_headers: data.col_headers || [] };
    }
    var cached = _metaCache[name] || {};
    var hdrs = cached.col_headers || [];

    var html = '<div class="vcf-viewer">';
    html += '<p class="vcf-meta">' + (data.total || 0).toLocaleString() + ' variant(s)</p>';

    // Collapsible metadata (## lines)
    if (cached.meta) {
      var metaLines = cached.meta.split('\n');
      html +=
        '<details style="margin-bottom:12px">' +
        '<summary style="cursor:pointer;font-size:13px;color:#666">Show metadata (' +
        metaLines.length + ' lines)</summary>' +
        '<pre style="font-size:11px;color:#888;margin-top:4px;max-height:200px;overflow:auto">' +
        escapeHtml(cached.meta) + '</pre></details>';
    }

    html += renderTable(name, hdrs, data.rows || [], data.total || 0, page);
    html += '</div>';
    target.innerHTML = html;
  }

  // Global pagination handler
  window._vcfPluginPaginate = function (name, page) {
    if (page < 0) return;
    renderPage(name, page);
  };

  // ── IGV.js integration ──
  var KNOWN_GENOMES = [
    {id:'hg38', label:'Human (GRCh38/hg38)'},
    {id:'hg19', label:'Human (GRCh37/hg19)'},
    {id:'mm39', label:'Mouse (GRCm39/mm39)'},
    {id:'mm10', label:'Mouse (GRCm38/mm10)'},
    {id:'rn7',  label:'Rat (mRatBN7.2/rn7)'},
    {id:'rn6',  label:'Rat (Rnor_6.0/rn6)'},
    {id:'dm6',  label:'Fruit fly (BDGP6/dm6)'},
    {id:'ce11', label:'C. elegans (WBcel235/ce11)'},
    {id:'danRer11', label:'Zebrafish (GRCz11/danRer11)'},
    {id:'sacCer3',  label:'Yeast (sacCer3)'},
    {id:'tair10',   label:'Arabidopsis (TAIR10)'},
    {id:'galGal6',  label:'Chicken (GRCg6a/galGal6)'}
  ];
  var _igvRef = null;
  var _igvMode = 'data';
  var _selectedGenome = null;

  function _fetchReference() {
    return fetch('/api/reference').then(function(r) { return r.json(); })
      .then(function(d) { _igvRef = d.reference || null; })
      .catch(function() { _igvRef = null; });
  }

  function _loadIgvJs() {
    return new Promise(function(resolve, reject) {
      if (window.igv) { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/igv@3/dist/igv.min.js';
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error('Failed to load igv.js')); };
      document.head.appendChild(s);
    });
  }

  function _buildGenomeDropdown() {
    var current = _selectedGenome || _igvRef || '';
    var html = '<span style="font-size:12px;color:#888;font-weight:500;margin-right:4px">Reference:</span>';
    html += '<select id="__igv_genome_select__" style="font-size:12px;padding:4px 8px;max-width:220px;border:1px solid #ddd;border-radius:4px">';
    html += '<option value="' + (_igvRef || '') + '"' + (current === _igvRef ? ' selected' : '') + '>' + (_igvRef || 'none') + '</option>';
    KNOWN_GENOMES.forEach(function(g) {
      if (g.id !== _igvRef) {
        html += '<option value="' + g.id + '"' + (current === g.id ? ' selected' : '') + '>' + g.label + '</option>';
      }
    });
    html += '</select>';
    return html;
  }

  function _renderIgv(container, fileUrl, filename, trackType, trackFormat) {
    container.innerHTML = '<div id="__igv_div__">Loading IGV.js...</div>';
    _loadIgvJs().then(function() {
      var div = document.getElementById('__igv_div__');
      if (!div) return;
      div.innerHTML = '';
      var activeRef = _selectedGenome || _igvRef;
      var opts = {};
      var knownIds = KNOWN_GENOMES.map(function(g) { return g.id; });
      if (knownIds.indexOf(activeRef) >= 0) {
        opts.genome = activeRef;
      } else {
        opts.reference = { fastaURL: '/file/' + encodeURIComponent(activeRef), indexed: false };
      }
      opts.tracks = [{ type: trackType, format: trackFormat, url: fileUrl, name: filename }];
      igv.createBrowser(div, opts);
    }).catch(function(e) {
      container.innerHTML = '<div style="color:red;padding:16px;">IGV Error: ' + e.message + '</div>';
    });
  }

  var TRACK_TYPE = 'variant';
  var TRACK_FORMAT = 'vcf';

  function _renderData(container, fileUrl, filename) {
    container.innerHTML = '<div class="vcf-viewer"><p class="vcf-meta">Loading VCF...</p></div>';
    renderPage(filename, 0).catch(function (e) {
      container.innerHTML =
        '<div class="vcf-viewer"><p style="color:red">Error: ' + e.message + '</p></div>';
    });
  }

  function _showView(container, fileUrl, filename) {
    if (_igvRef) {
      var tabsHtml = '<div style="display:flex;gap:4px;margin-bottom:12px">';
      tabsHtml += '<button id="__tab_data__" style="padding:6px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:13px;' + (_igvMode === 'data' ? 'background:#007bff;color:white;border-color:#007bff' : 'background:#f8f8f8') + '">Data</button>';
      tabsHtml += '<button id="__tab_igv__" style="padding:6px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:13px;' + (_igvMode === 'igv' ? 'background:#007bff;color:white;border-color:#007bff' : 'background:#f8f8f8') + '">IGV</button>';
      tabsHtml += '</div>';
      if (_igvMode === 'igv') tabsHtml += _buildGenomeDropdown();
      container.innerHTML = tabsHtml + '<div id="__plugin_content__"></div>';

      container.querySelector('#__tab_data__').onclick = function() { _igvMode = 'data'; _showView(container, fileUrl, filename); };
      container.querySelector('#__tab_igv__').onclick = function() { _igvMode = 'igv'; _showView(container, fileUrl, filename); };
      var genomeSelect = container.querySelector('#__igv_genome_select__');
      if (genomeSelect) genomeSelect.onchange = function() { _selectedGenome = this.value; _showView(container, fileUrl, filename); };

      var content = container.querySelector('#__plugin_content__');
      if (_igvMode === 'igv') {
        _renderIgv(content, fileUrl, filename, TRACK_TYPE, TRACK_FORMAT);
      } else {
        _renderData(content, fileUrl, filename);
      }
    } else {
      _renderData(container, fileUrl, filename);
    }
  }

  window.AutoPipePlugin = {
    render: function (container, fileUrl, filename) {
      _container = container;
      _igvMode = 'data';
      _selectedGenome = null;

      _fetchReference().then(function() {
        _showView(container, fileUrl, filename);
      });
    },
    destroy: function () {
      _container = null;
      _metaCache = {};
      delete window._vcfPluginPaginate;
    },
  };
})();
