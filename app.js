(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ISO = ['TUN', 'DZA', 'MAR', 'LBY', 'EGY'];
  const fmtPct = (v, d = 2) => (v == null || isNaN(v) ? '–' : d3.format(`.${d}f`)(v) + '%');
  const fmtKm = (v) => (v == null || isNaN(v) ? '–' : d3.format(',.0f')(v));
  const C = dash.colors;
  const WWF = { green: 'var(--wwf-green)', orange: 'var(--wwf-orange)', blue: 'var(--wwf-blue)', aqua: 'var(--wwf-aqua)', red: 'var(--wwf-red)',
    berry: 'var(--wwf-berry)', brown: 'var(--wwf-brown)', olive: 'var(--wwf-olive)', yellow: 'var(--wwf-yellow)', mgreen: 'var(--wwf-medium-green)',
    rviolet: 'var(--wwf-red-violet)', dbrown: 'var(--wwf-dark-brown)', grey: 'var(--wwf-grey-20)' };
  const COUNTRY_C = { TUN: WWF.red, DZA: WWF.brown, MAR: WWF.berry, LBY: WWF.olive, EGY: WWF.aqua };
  const METRIC_C = { land_pct: WWF.green, land_pa_pct: WWF.olive, sea_pct: WWF.blue, kba_mean_pct: WWF.berry };
  const NEED = ['countries', 'timeseries', 'sites', 'kbas', 'ecoregions', 'wetlands', 'governance', 'effectiveness', 'narratives', 'geo', 'sitesgeo'];

  // ------------------------------------------------------------------ regional totals (pooled across the five countries)
  dash.calc('region', {
    inputs: ['countries', 'kbas'],
    title: 'Regional totals',
    description: 'Five countries pooled: covered area divided by total area per realm; KBA mean over all KBAs.',
    fn: (countries, kbas) => {
      const s = (k) => d3.sum(countries, (r) => +r[k]);
      const land = s('land_km2'), sea = s('sea_km2');
      return [{
        land_km2: land, sea_km2: sea, covered_land_km2: s('covered_land_km2'), covered_sea_km2: s('covered_sea_km2'),
        land_pct: +(s('covered_land_km2') / land * 100).toFixed(2), pa_pct: +(s('pa_land_km2') / land * 100).toFixed(2),
        oecm_pct: +(s('oecm_land_km2') / land * 100).toFixed(2), sea_pct: +(s('covered_sea_km2') / sea * 100).toFixed(2),
        sea_needed_km2: Math.round(0.3 * sea - s('covered_sea_km2')), land_needed_km2: Math.max(0, Math.round(0.3 * land - s('covered_land_km2'))),
        kba_mean_pct: +d3.mean(kbas, (r) => +r.covered_pct).toFixed(2), kba_count: kbas.length,
        countries_over_30_land: countries.filter((r) => +r.land_pct >= 30).length,
      }];
    },
  });

  // ------------------------------------------------------------------ tabs and links
  let tab = 'overview';
  const showTab = (t, link = true) => {
    tab = t;
    $$('.na-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('.na-page').forEach((p) => (p.hidden = p.dataset.page !== t));
    if (link) dash.setLink(t);
    draw();
  };
  $$('.na-tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ------------------------------------------------------------------ filter state (page-level; no query uses these)
  const P = () => Object.assign({ iso: 'TUN', metric: 'land_pct', realm: 'Land', kbagroup: 'all', sitefilter: 'all', layers: ['pa', 'oecm', 'kba', 'sea'] }, dash.params());
  const chips = (el, items, current, onPick, multi = false) => {
    el.replaceChildren(...items.map(([v, label]) => {
      const b = document.createElement('button');
      b.className = 'na-chip'; b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(multi ? current.includes(v) : current === v));
      b.addEventListener('click', () => onPick(v));
      return b;
    }));
  };
  const local = { kbaq: '', siteq: '', kbasort: ['covered_pct', 1], sitesort: ['net_land_km2', -1], ctsort: ['land_pct', -1] };
  $('#kba-search').addEventListener('input', (e) => { local.kbaq = e.target.value.toLowerCase(); draw(); });
  $('#site-search').addEventListener('input', (e) => { local.siteq = e.target.value.toLowerCase(); draw(); });

  // ------------------------------------------------------------------ helpers
  const tipIn = (box) => {
    let t = box.querySelector('.na-tip');
    if (!t) { t = document.createElement('div'); t.className = 'na-tip'; t.hidden = true; box.appendChild(t); }
    return {
      show(ev, lines) {
        t.replaceChildren(...lines.map((l, i) => { const d = document.createElement('div'); if (i === 0) d.className = 't'; d.textContent = l; return d; }));
        t.hidden = false;
        const r = box.getBoundingClientRect();
        let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
        if (x + t.offsetWidth > r.width) x = Math.max(0, ev.clientX - r.left - t.offsetWidth - 12);
        if (y + t.offsetHeight > r.height) y = Math.max(0, ev.clientY - r.top - t.offsetHeight - 12);
        t.style.left = x + 'px'; t.style.top = y + 'px';
      },
      hide() { t.hidden = true; },
    };
  };
  const svgIn = (el, w, h) => {
    el.querySelectorAll('svg').forEach((s) => s.remove());
    return d3.select(el).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
  };
  const axisStyle = (g) => g.attr('font-size', null).attr('font-family', null).call((s) => s.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)'))
    .call((s) => s.selectAll('.domain').attr('stroke', 'var(--cds-chart-axis)')).call((s) => s.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'));
  const rowsOf = (id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : null; };

  // horizontal stacked bars with labels above each bar (ecoregions, wetlands, least-covered list)
  const hbars = (el, items, opts = {}) => {
    const w = Math.max(280, el.clientWidth), rowH = 40, top = 8, h = top + items.length * rowH + 22;
    const svg = svgIn(el, w, h);
    const right = 54, x = d3.scaleLinear([0, 100], [0, w - right]);
    svg.append('line').attr('x1', x(30)).attr('x2', x(30)).attr('y1', 0).attr('y2', h - 18).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    svg.append('text').attr('x', x(30) + 4).attr('y', h - 4).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text('30%');
    const tip = tipIn(el);
    items.forEach((d, i) => {
      const y = top + i * rowH;
      svg.append('text').attr('x', 0).attr('y', y + 11).attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(d.label);
      svg.append('rect').attr('x', 0).attr('y', y + 20).attr('width', x(100)).attr('height', 10).attr('rx', 4).attr('fill', 'var(--cds-chart-grid)');
      let x0 = 0;
      d.parts.forEach((p, j) => {
        const wv = Math.max(0, Math.min(100 - x0, p.v));
        if (wv > 0) svg.append('rect').attr('x', x(x0)).attr('y', y + 20).attr('width', Math.max(1.5, x(x0 + wv) - x(x0))).attr('height', 10).attr('rx', 4).attr('fill', p.c);
        x0 += wv;
      });
      svg.append('text').attr('x', x(Math.min(100, x0)) + 5).attr('y', y + 29).attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)')
        .style('font-variant-numeric', 'tabular-nums').text(fmtPct(d.total, 1));
      svg.append('rect').attr('x', 0).attr('y', y).attr('width', w).attr('height', rowH).attr('fill', 'transparent')
        .on('mousemove', (ev) => tip.show(ev, d.tip)).on('mouseleave', () => tip.hide());
    });
  };

  // ------------------------------------------------------------------ maps (Mollweide km, y already flipped)
  const maps = {};
  const mapFrame = (el, key, ratio) => {
    const w = Math.max(280, el.clientWidth), h = Math.round(w * ratio);
    if (!maps[key] || maps[key].w !== w) {
      el.querySelectorAll('svg').forEach((s) => s.remove());
      const svg = d3.select(el).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
      const g = svg.append('g'), labels = svg.append('g');
      const zoom = d3.zoom().scaleExtent([0.02, 400]).on('zoom', (ev) => { g.attr('transform', ev.transform); maps[key].t = ev.transform; maps[key].onzoom?.(); });
      svg.call(zoom);
      maps[key] = { w, h, svg, g, labels, zoom, fitted: null };
    }
    return maps[key];
  };
  const fit = (m, node, pad = 0.92) => {
    const b = node.getBBox();
    if (!b.width) return;
    const k = Math.min(m.w / b.width, m.h / b.height) * pad;
    const t = d3.zoomIdentity.translate(m.w / 2 - k * (b.x + b.width / 2), m.h / 2 - k * (b.y + b.height / 2)).scale(k);
    m.svg.call(m.zoom.transform, t);
  };
  const METRICS = [['land_pct', 'Land, PAs + OECMs', 60], ['land_pa_pct', 'Land, PAs only', 15], ['sea_pct', 'Sea', 5], ['kba_mean_pct', 'KBA coverage', 60]];

  const drawRegionMap = (geo, countries) => {
    const el = $('#regionmap'), p = P(), m = mapFrame(el, 'region', 0.62);
    const [mk, mlabel, mmax] = METRICS.find((x) => x[0] === p.metric) || METRICS[0];
    const by = Object.fromEntries(countries.map((r) => [r.iso3, r]));
    m.g.selectAll('*').remove(); m.labels.selectAll('*').remove();
    m.g.selectAll('path.sea').data(geo.filter((r) => r.layer === 'sea')).join('path').attr('class', 'sea').attr('d', (r) => r.d);
    const tip = tipIn(el);
    const lands = m.g.selectAll('path.country').data(geo.filter((r) => r.layer === 'land')).join('path').attr('class', 'land country').attr('d', (r) => r.d)
      .attr('fill', METRIC_C[mk]).attr('fill-opacity', (r) => 0.1 + 0.85 * Math.min(1, (+by[r.iso3][mk] || 0) / mmax))
      .attr('data-source', 'countries').attr('data-field', mk).attr('data-where', (r) => `iso3=${r.iso3}`)
      .on('mousemove', (ev, r) => { const c = by[r.iso3]; tip.show(ev, [c.country, `Land ${fmtPct(c.land_pct)} (PAs ${fmtPct(c.land_pa_pct)}, OECMs ${fmtPct(c.land_oecm_pct)})`, `Sea ${fmtPct(c.sea_pct)}`, `KBAs ${fmtPct(c.kba_mean_pct, 1)} on average`]); })
      .on('mouseleave', () => tip.hide())
      .on('click', (ev, r) => { dash.setParams({ iso: r.iso3 }); showTab('country'); });
    if (m.fitted !== 'region') { fit(m, m.g.node(), 0.98); m.fitted = 'region'; }
    const place = () => {
      const t = m.t || d3.zoomIdentity;
      m.labels.selectAll('g').data(lands.nodes().map((n) => { const b = n.getBBox(); const r = d3.select(n).datum(); return { r, x: b.x + b.width / 2, y: b.y + b.height / 2 }; }))
        .join((en) => { const gg = en.append('g').style('pointer-events', 'none'); gg.append('text').attr('class', 'n'); gg.append('text').attr('class', 'v'); return gg; })
        .attr('transform', (d) => `translate(${t.applyX(d.x)},${t.applyY(d.y)})`)
        .call((gg) => gg.select('.n').attr('text-anchor', 'middle').attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text((d) => by[d.r.iso3].country))
        .call((gg) => gg.select('.v').attr('text-anchor', 'middle').attr('dy', '1.2em').attr('fill', 'var(--color-fg)').style('font-weight', 'var(--cds-font-weight-medium)')
          .style('font-size', 'var(--cds-font-size-caption)').text((d) => fmtPct(by[d.r.iso3][mk], mk === 'sea_pct' ? 2 : 1)));
    };
    m.onzoom = place; place();
    const lg = $('#regionlegend');
    lg.replaceChildren(...[0, 0.25, 0.5, 0.75, 1].map((f) => {
      const s = document.createElement('span'), i = document.createElement('i');
      i.style.background = METRIC_C[mk]; i.style.opacity = String(0.1 + 0.85 * f);
      s.append(i, document.createTextNode(`${Math.round(f * mmax)}%${f === 1 ? '+' : ''}`)); return s;
    }), Object.assign(document.createElement('span'), { textContent: mlabel }));
  };

  // details card for clicked map features (sites first, the one holding the area on top; then KBAs)
  const showCard = (box, ss, ks) => {
    let c = box.querySelector('.map-card');
    if (!c) { c = document.createElement('div'); c.className = 'map-card'; box.appendChild(c); }
    if (!ss.length && !ks.length) { c.hidden = true; return; }
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const kv = (dl, k, v) => { if (v == null || v === '') return; dl.append(mk('dt', null, k), mk('dd', null, String(v))); };
    const head = mk('div', 'mc-head');
    const close = mk('button', 'mc-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close details'); close.addEventListener('click', () => { c.hidden = true; });
    head.append(mk('b', null, `${ss.length + ks.length} feature${ss.length + ks.length > 1 ? 's' : ''} here`), close);
    const list = mk('div', 'mc-list');
    ss.forEach((r, i) => {
      const it = mk('section', 'mc-item');
      const badge = mk('span', 'mc-badge ' + (r.site_type === 'OECM' ? 'oecm' : 'pa'), r.site_type === 'OECM' ? 'OECM' : 'Protected area');
      it.append(badge, mk('h4', null, r.site));
      const dl = mk('dl');
      kv(dl, 'Designation', `${r.designation} (${r.designation_type})`); kv(dl, 'Year', r.year); kv(dl, 'Status', r.status);
      kv(dl, 'IUCN category', r.iucn); kv(dl, 'Governance', r.governance);
      const net = (r.net_land_km2 || 0) + (r.net_sea_km2 || 0);
      kv(dl, 'Area counted', net > 0.005 ? `${d3.format(',.2f')(r.net_land_km2 || 0)} km² land · ${d3.format(',.2f')(r.net_sea_km2 || 0)} km² sea` : 'none: this ground is counted under an earlier designation');
      kv(dl, 'Last evaluation', r.effectiveness_year); kv(dl, 'WDPA ID', r.site_id);
      if (i === 0 && ss.length > 1 && net > 0.005) it.append(mk('p', 'mc-note', 'Holds the area here; the records below overlap it.'));
      it.append(dl); list.append(it);
    });
    ks.forEach((k) => {
      const it = mk('section', 'mc-item');
      it.append(mk('span', 'mc-badge kba', 'KBA'), mk('h4', null, k.kba));
      const dl = mk('dl');
      kv(dl, 'Covered', `${fmtPct(k.covered_pct, 1)} (protected areas ${fmtPct(k.pa_only_pct, 1)})`); kv(dl, 'Class', k.coverage_class);
      kv(dl, 'Area', `${d3.format(',.1f')(k.area_km2)} km²`);
      kv(dl, 'Groups', ['marine', 'freshwater', 'mountain', 'terrestrial'].filter((g) => k[g] === 'Y').join(', '));
      kv(dl, 'SitRecID', k.sitrecid); it.append(dl); list.append(it);
    });
    c.replaceChildren(head, list); c.hidden = false;
  };

  const LAYERS = [['pa', 'Protected areas'], ['oecm', 'OECMs'], ['kba', 'KBAs by coverage'], ['sea', 'Sea zone']];
  const kbaFill = (v) => (v == null ? 'var(--cds-chart-muted)' : v >= 98 ? WWF.green : v >= 50 ? WWF.mgreen : v > 0 ? WWF.yellow : WWF.red);
  const drawCountryMap = (geo, kbas, country) => {
    const el = $('#countrymap'), p = P(), iso = p.iso, m = mapFrame(el, 'country', 0.8), on = new Set(p.layers || []);
    const kb = Object.fromEntries(kbas.filter((r) => r.iso3 === iso).map((r) => [String(r.sitrecid), r]));
    m.g.selectAll('*').remove();
    const oldCard = el.querySelector('.map-card'); if (oldCard) oldCard.hidden = true;
    const tip = tipIn(el);
    if (on.has('sea')) m.g.selectAll('path.sea').data(geo.filter((r) => r.layer === 'sea' && r.iso3 === iso)).join('path').attr('class', 'sea').attr('d', (r) => r.d);
    m.g.selectAll('path.other').data(geo.filter((r) => r.layer === 'land' && r.iso3 !== iso)).join('path').attr('class', 'land other').attr('d', (r) => r.d)
      .attr('fill', 'var(--color-bg)').attr('stroke-opacity', 0.5);
    const landSel = m.g.selectAll('path.this').data(geo.filter((r) => r.layer === 'land' && r.iso3 === iso)).join('path').attr('class', 'land this').attr('d', (r) => r.d)
      .attr('fill', 'var(--color-panel)');
    if (on.has('oecm')) m.g.selectAll('path.oe').data(geo.filter((r) => r.layer === 'oecm' && r.iso3 === iso)).join('path').attr('class', 'oe').attr('d', (r) => r.d)
      .attr('fill', C[1]).attr('fill-opacity', 0.55).attr('stroke', C[1]).attr('stroke-width', 0.6);
    if (on.has('pa')) m.g.selectAll('path.pa').data(geo.filter((r) => r.layer === 'pa' && r.iso3 === iso)).join('path').attr('class', 'pa').attr('d', (r) => r.d)
      .attr('fill', C[0]).attr('fill-opacity', 0.8).attr('stroke', C[0]).attr('stroke-width', 0.6);
    if (on.has('kba')) m.g.selectAll('path.kba').data(geo.filter((r) => r.layer === 'kba' && r.iso3 === iso)).join('path').attr('class', 'kba').attr('d', (r) => r.d)
      .attr('fill', (r) => kbaFill(r.value)).attr('fill-opacity', 0.6).attr('stroke', 'var(--color-fg)').attr('stroke-width', 0.5)
      .attr('data-source', 'kbas').attr('data-field', 'covered_pct').attr('data-where', (r) => `sitrecid=${r.id}`)
      .attr('data-kind', 'kba').attr('data-id', (r) => r.id);
    // individual sites on top: outlines only, so the merged colours stay as they are, but every site can be hovered and clicked
    const siteInfo = Object.fromEntries(rowsOf('sites').filter((r) => r.iso3 === iso).map((r) => [String(r.site_id), r]));
    const shown = rowsOf('sitesgeo').filter((r) => r.iso3 === iso && siteInfo[r.site_id] && on.has(siteInfo[r.site_id].site_type === 'OECM' ? 'oecm' : 'pa'))
      .sort((a, b) => b.area_km2 - a.area_km2);
    m.g.selectAll('path.site').data(shown).join('path').attr('class', 'site').attr('d', (r) => r.d)
      .attr('fill', 'transparent').attr('stroke', 'var(--wwf-white)').attr('stroke-opacity', 0.7).attr('stroke-width', 0.6)
      .attr('data-kind', 'site').attr('data-id', (r) => r.site_id);
    const hitsAt = (ev) => {
      const all = document.elementsFromPoint(ev.clientX, ev.clientY);
      const els = all.length && m.svg.node().contains(all[0]) ? all.filter((e) => e.dataset && e.dataset.kind && el.contains(e)) : [];
      const ss = [], ks = [], seen = new Set();
      els.forEach((e) => { const key = e.dataset.kind + e.dataset.id; if (seen.has(key)) return; seen.add(key);
        if (e.dataset.kind === 'site' && siteInfo[e.dataset.id]) ss.push(siteInfo[e.dataset.id]);
        if (e.dataset.kind === 'kba' && kb[e.dataset.id]) ks.push(kb[e.dataset.id]); });
      ss.sort((a, b) => ((b.net_land_km2 || 0) + (b.net_sea_km2 || 0)) - ((a.net_land_km2 || 0) + (a.net_sea_km2 || 0)));
      return { ss, ks, els: els.filter((e) => e.classList.contains('site') || e.classList.contains('kba')) };
    };
    let lit = [];
    const light = (els) => { lit.forEach((e) => e.classList.remove('lit')); lit = els; lit.forEach((e) => e.classList.add('lit')); };
    m.svg.on('pointermove.info', (ev) => {
      const { ss, ks, els } = hitsAt(ev);
      if (!ss.length && !ks.length) { tip.hide(); light([]); return; }
      light(els.slice(0, 1));
      const first = ss[0] ? `${ss[0].site} · ${ss[0].designation}` : `KBA · ${ks[0].kba} · ${fmtPct(ks[0].covered_pct, 1)} covered`;
      const more = ss.length + ks.length - 1;
      tip.show(ev, [first, more > 0 ? `+${more} more here · click for details` : 'Click for details']);
    }).on('pointerleave.info', () => { tip.hide(); light([]); })
      .on('click.info', (ev) => { const h = hitsAt(ev); tip.hide(); showCard(el, h.ss, h.ks); });
    if (m.fitted !== iso) { fit(m, landSel.node()); m.fitted = iso; }
    $('#countrymap-title').textContent = `${country.country}: protected areas, OECMs and KBAs`;
    const lg = $('#countrylegend');
    const item = (c, o, t) => { const s = document.createElement('span'), i = document.createElement('i'); i.style.background = c; i.style.opacity = o; s.append(i, document.createTextNode(t)); return s; };
    lg.replaceChildren(item(C[0], 0.8, 'Protected areas'), item(C[1], 0.55, 'OECMs (PA area removed)'), item(WWF.green, 0.6, 'KBA complete (≥98%)'),
      item(WWF.mgreen, 0.6, 'KBA 50–98%'), item(WWF.yellow, 0.6, 'KBA under 50%'), item(WWF.red, 0.6, 'KBA not covered'));
  };

  // ------------------------------------------------------------------ charts
  const drawLandBars = (countries) => {
    const el = $('#landbars'), w = Math.max(280, el.clientWidth);
    const rows = ISO.map((i) => countries.find((r) => r.iso3 === i));
    const left = 70, right = 48, bandH = 44, h = rows.length * bandH + 26;
    const svg = svgIn(el, w, h), x = d3.scaleLinear([0, 60], [left, w - right]);
    svg.append('g').attr('transform', `translate(0,${h - 20})`).call(d3.axisBottom(x).ticks(6).tickFormat((d) => d + '%')).call(axisStyle);
    svg.append('line').attr('x1', x(30)).attr('x2', x(30)).attr('y1', 0).attr('y2', h - 20).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    const tip = tipIn(el);
    rows.forEach((r, i) => {
      const y = i * bandH + 4;
      svg.append('text').attr('x', left - 8).attr('y', y + 14).attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(r.country);
      svg.append('rect').attr('x', x(0)).attr('y', y + 4).attr('height', 13).attr('rx', 4).attr('width', Math.max(1.5, x(r.land_pa_pct) - x(0))).attr('fill', C[0]);
      if (+r.land_oecm_pct > 0) svg.append('rect').attr('x', x(r.land_pa_pct)).attr('y', y + 4).attr('height', 13).attr('rx', 4).attr('width', x(+r.land_pa_pct + +r.land_oecm_pct) - x(r.land_pa_pct)).attr('fill', C[1]);
      svg.append('text').attr('x', x(Math.min(60, r.land_pct)) + 5).attr('y', y + 15).attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(fmtPct(r.land_pct, 1));
      svg.append('rect').attr('x', x(0)).attr('y', y + 21).attr('height', 9).attr('rx', 4).attr('width', Math.max(1.5, x(r.sea_pct) - x(0))).attr('fill', C[4]);
      svg.append('text').attr('x', x(r.sea_pct) + 5).attr('y', y + 29).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(`sea ${fmtPct(r.sea_pct)}`);
      svg.append('rect').attr('x', 0).attr('y', y).attr('width', w).attr('height', bandH).attr('fill', 'transparent')
        .on('mousemove', (ev) => tip.show(ev, [r.country, `Land ${fmtPct(r.land_pct)}: PAs ${fmtPct(r.land_pa_pct)}, OECMs ${fmtPct(r.land_oecm_pct)}`, `Sea ${fmtPct(r.sea_pct)}`]))
        .on('mouseleave', () => tip.hide());
    });
    $('#lg-pa').style.background = C[0]; $('#lg-oe').style.background = C[1]; $('#lg-sea').style.background = C[4];
  };

  const stepLines = (el, series, yMax, opts = {}) => {
    const w = Math.max(280, el.clientWidth), h = 240, m = { l: 40, r: 120, t: 10, b: 24 };
    const svg = svgIn(el, w, h);
    const x = d3.scaleLinear([1940, 2030], [m.l, w - m.r]), y = d3.scaleLinear([0, yMax], [h - m.b, m.t]);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(6, Math.floor(w / 80))).tickFormat(d3.format('d'))).call(axisStyle);
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat((d) => d + '%')).call(axisStyle).call((g) => g.select('.domain').remove());
    if (yMax >= 30) svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(30)).attr('y2', y(30)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    const line = d3.line().curve(d3.curveStepAfter).x((d) => x(d.year)).y((d) => y(d.v));
    const ends = [];
    series.forEach((s) => {
      const pts = [...s.pts, { year: 2030, v: s.pts[s.pts.length - 1].v }];
      svg.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', s.c).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
      ends.push({ y: y(s.pts[s.pts.length - 1].v), s });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    ends.forEach((e) => svg.append('text').attr('x', w - m.r + 6).attr('y', e.y + 4).attr('fill', e.s.c).style('font-size', 'var(--cds-font-size-caption)')
      .text(`${e.s.name} ${fmtPct(e.s.pts[e.s.pts.length - 1].v, 2)}`));
    const tip = tipIn(el);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev), yr = Math.round(x.invert(px));
        tip.show(ev, [String(yr), ...series.map((s) => { const pt = [...s.pts].reverse().find((q) => q.year <= yr); return `${s.name}: ${fmtPct(pt ? pt.v : 0)}`; })]);
      }).on('mouseleave', () => tip.hide());
  };

  const stack100 = (el, groups) => {
    const w = Math.max(280, el.clientWidth), h = groups.length * 70;
    const svg = svgIn(el, w, h), x = d3.scaleLinear([0, 100], [0, w]);
    const tip = tipIn(el);
    groups.forEach((g, i) => {
      const y = i * 70;
      svg.append('text').attr('x', 0).attr('y', y + 12).attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').style('font-weight', 'var(--cds-font-weight-medium)').text(g.title);
      let x0 = 0;
      g.parts.forEach((p) => {
        const wv = p.v;
        if (wv > 0) svg.append('rect').attr('x', x(x0)).attr('y', y + 18).attr('width', Math.max(1.5, x(x0 + wv) - x(x0) - 1)).attr('height', 14).attr('rx', 3).attr('fill', p.c)
          .on('mousemove', (ev) => tip.show(ev, [g.title, `${p.name}: ${fmtPct(p.v, 1)} of covered land`, `${p.sites} sites`])).on('mouseleave', () => tip.hide());
        x0 += wv;
      });
      const lab = g.parts.filter((p) => p.v > 0).map((p) => `${p.name} ${fmtPct(p.v, 1)}`).join(' · ');
      svg.append('text').attr('x', 0).attr('y', y + 48).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(lab);
    });
  };

  const groupedBars = (el, cats, series, yMax, opts = {}) => {
    const w = Math.max(280, el.clientWidth), h = 220, m = { l: 36, r: 8, t: 10, b: 40 };
    const svg = svgIn(el, w, h);
    const x0 = d3.scaleBand(cats.map((c) => c.key), [m.l, w - m.r]).paddingInner(0.25).paddingOuter(0.1);
    const x1 = d3.scaleBand(series.map((s) => s.key), [0, x0.bandwidth()]).padding(0.12);
    const y = d3.scaleLinear([0, yMax], [h - m.b, m.t]);
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat((d) => d + '%')).call(axisStyle).call((g) => g.select('.domain').remove());
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x0).tickFormat((k) => cats.find((c) => c.key === k).label).tickSize(0)).call(axisStyle).call((g) => g.select('.domain').remove());
    if (yMax >= 30 && opts.target) svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(30)).attr('y2', y(30)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    const tip = tipIn(el);
    cats.forEach((c) => series.forEach((s, j) => {
      const v = c.vals[s.key];
      if (v == null) return;
      svg.append('rect').attr('x', x0(c.key) + x1(s.key)).attr('y', y(Math.min(yMax, v))).attr('width', x1.bandwidth()).attr('height', Math.max(1.5, y(0) - y(Math.min(yMax, v)))).attr('rx', 3).attr('fill', s.c)
        .on('mousemove', (ev) => tip.show(ev, [c.label, `${s.name}: ${fmtPct(v, 1)}`])).on('mouseleave', () => tip.hide());
    }));
    const lg = svg.append('g').attr('transform', `translate(${m.l},${h - 12})`);
    let lx = 0;
    series.forEach((s) => { lg.append('rect').attr('x', lx).attr('y', -9).attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', s.c);
      const t = lg.append('text').attr('x', lx + 14).attr('y', 0).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(s.name);
      lx += 14 + t.node().getComputedTextLength() + 14; });
  };

  // ------------------------------------------------------------------ tables
  const table = (sel, rows, cols, sortState, keyCol, onRow) => {
    const tb = $(sel + ' tbody');
    const [k, dir] = sortState;
    const sorted = [...rows].sort((a, b) => {
      const va = a[k], vb = b[k];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
    tb.replaceChildren(...sorted.map((r) => {
      const tr = document.createElement('tr');
      if (onRow) { tr.className = 'pick'; tr.tabIndex = 0; tr.addEventListener('click', () => onRow(r)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') onRow(r); }); }
      cols.forEach(([c, f, cls]) => { const td = document.createElement('td'); if (cls) td.className = cls; const v = f ? f(r) : r[c]; if (v instanceof Node) td.append(v); else td.textContent = v == null ? '' : String(v); tr.append(td); });
      return tr;
    }));
    $$(sel + ' th').forEach((th) => { const f = th.dataset.field; th.setAttribute('aria-sort', f === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
  };
  const sortable = (sel, stateKey) => $$(sel + ' th button').forEach((b) => b.addEventListener('click', () => {
    const [k, d] = local[stateKey]; local[stateKey] = [b.dataset.k, k === b.dataset.k ? -d : (b.closest('th').classList.contains('n') ? -1 : 1)]; draw();
  }));
  sortable('#countrytable', 'ctsort'); sortable('#kbatable', 'kbasort'); sortable('#sitetable', 'sitesort');
  const barCell = (v, color) => { const s = document.createElement('span'); const bar = document.createElement('span'); bar.className = 'bar'; const b = document.createElement('b');
    b.style.width = Math.min(100, v || 0) + '%'; b.style.setProperty('--na-bar', color); bar.append(b); s.append(bar, document.createTextNode(fmtPct(v, 1))); return s; };
  const pill = (t) => { const s = document.createElement('span'); s.className = 'pill ' + (t === 'Complete' || t === 'Yes' ? 'ok' : t === 'None' || t === 'No' ? 'bad' : 'warn'); s.textContent = t; return s; };

  // ------------------------------------------------------------------ narratives
  const para = (n) => { const s = document.createElement('section'); const h = document.createElement('h3'); h.textContent = n.heading; const p = document.createElement('p'); p.textContent = n.text; s.append(h, p); return s; };

  // ------------------------------------------------------------------ main draw
  let lastIso = null;
  function draw() {
    const st = NEED.map((id) => dash.data(id).status);
    const ready = st.every((s) => s === 'ok');
    const region = dash.data('region');
    $('#takeaway').textContent = region.status === 'ok' && region.data.length
      ? `Together the five countries cover ${fmtPct(region.data[0].land_pct, 1)} of their land and ${fmtPct(region.data[0].sea_pct, 1)} of their sea. OECMs supply ${fmtPct(region.data[0].oecm_pct, 1)} of the land figure; the sea is the gap.`
      : '';
    $$('[data-source="region"][data-field]').forEach((e) => {
      if (region.status !== 'ok') return;
      const v = region.data[0][e.dataset.field];
      e.textContent = /needed/.test(e.dataset.field) ? fmtKm(v) : fmtPct(v, 2);
    });
    if (!ready) return;
    const countries = rowsOf('countries'), geo = rowsOf('geo'), kbas = rowsOf('kbas').map((r) => ({ ...r, sitrecid: +r.sitrecid }));
    const p = P(), by = Object.fromEntries(countries.map((r) => [r.iso3, r])), cur = by[p.iso] || by.TUN;
    const narr = rowsOf('narratives');

    if (tab === 'overview') {
      chips($('#metric-chips'), METRICS.map((x) => [x[0], x[1]]), p.metric, (v) => dash.setParams({ metric: v }));
      drawRegionMap(geo, countries);
      drawLandBars(countries);
      table('#countrytable', countries, [
        ['iso3'], ['country'], ['land_pct', (r) => barCell(r.land_pct, C[0]), 'n'], ['land_pa_pct', (r) => fmtPct(r.land_pa_pct), 'n'], ['land_oecm_pct', (r) => fmtPct(r.land_oecm_pct), 'n'],
        ['sea_pct', (r) => fmtPct(r.sea_pct), 'n'], ['land_needed_km2', (r) => fmtKm(r.land_needed_km2), 'n'], ['sea_needed_km2', (r) => fmtKm(r.sea_needed_km2), 'n'],
        ['kba_mean_pct', (r) => fmtPct(r.kba_mean_pct, 1), 'n'], ['pp_land_pct', (r) => fmtPct(r.pp_land_pct), 'n'], ['pp_sea_pct', (r) => fmtPct(r.pp_sea_pct), 'n'],
      ], local.ctsort, 'iso3', (r) => { dash.setParams({ iso: r.iso3 }); showTab('country'); });
      $('#regionstory').replaceChildren(...narr.filter((n) => n.scope === 'REGION').slice(0, 4).map(para));
    }

    if (tab === 'country') {
      chips($('#country-chips'), ISO.map((i) => [i, by[i].country]), cur.iso3, (v) => dash.setParams({ iso: v }));
      $$('#country-kpis [data-field]').forEach((e) => {
        e.setAttribute('data-where', `iso3=${cur.iso3}`);
        const f = e.dataset.field, v = cur[f];
        if (e.classList.contains('ckl')) e.textContent = f === 'kba_count' ? `${v} KBAs` : `of ${fmtKm(v)} km²`;
        else e.textContent = /needed/.test(f) ? fmtKm(v) : fmtPct(v, 2);
      });
      chips($('#layer-chips'), LAYERS, p.layers, (v) => { const s = new Set(P().layers); s.has(v) ? s.delete(v) : s.add(v); dash.setParams({ layers: [...s] }); }, true);
      drawCountryMap(geo, kbas, cur);
      // facts and narrative
      const dl = $('#facts'); dl.replaceChildren();
      const fact = (k, v, href) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd');
        if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = v; dd.append(a); } else dd.textContent = v; dl.append(dt, dd); };
      fact('National figure', cur.national_figure); fact('National target', cur.national_target); fact('Base map', cur.base_map);
      fact('Records', `${cur.records} in WDPA/WD-OECM; ${cur.counted} counted (${cur.pa_counted} PAs, ${cur.oecm_counted} OECMs), ${cur.excluded} excluded`);
      fact('Protected Planet', `land ${fmtPct(cur.pp_land_pct)}, sea ${fmtPct(cur.pp_sea_pct)}`);
      fact('Full guide', `${cur.country} step-by-step guide`, cur.guide_url);
      $('#countrystory').replaceChildren(...narr.filter((n) => n.scope === cur.iso3).map(para));
      // time series
      const ts = rowsOf('timeseries').filter((r) => r.iso3 === cur.iso3);
      const series = [{ name: 'Land', c: C[0], pts: ts.map((r) => ({ year: r.year, v: r.land_pct })) }];
      if (+cur.land_oecm_pct > 0) series.push({ name: 'Land, PAs', c: C[2], pts: ts.map((r) => ({ year: r.year, v: r.land_pa_pct })) });
      series.push({ name: 'Sea', c: C[4], pts: ts.map((r) => ({ year: r.year, v: r.sea_pct })) });
      stepLines($('#tschart'), series, Math.max(10, Math.ceil(d3.max(ts, (r) => Math.max(r.land_pct, r.sea_pct)) / 10) * 10 + (cur.land_pct > 25 ? 10 : 0)));
      // ecoregions
      chips($('#realm-chips'), [['Land', 'Land'], ['Sea', 'Sea']], p.realm, (v) => dash.setParams({ realm: v }));
      const eco = rowsOf('ecoregions').filter((r) => r.iso3 === cur.iso3 && r.realm === p.realm).sort((a, b) => b.extent_km2 - a.extent_km2);
      hbars($('#ecochart'), eco.map((r) => ({ label: `${r.ecoregion} · ${fmtKm(r.extent_km2)} km²`, total: r.covered_pct,
        parts: [{ v: r.pa_km2 / r.extent_km2 * 100, c: C[0] }, { v: r.oecm_km2 / r.extent_km2 * 100, c: C[1] }],
        tip: [r.ecoregion, `${fmtPct(r.covered_pct, 1)} covered`, `PAs ${fmtKm(r.pa_km2)} km², OECMs ${fmtKm(r.oecm_km2)} km²`, r.biome] })));
      const wet = rowsOf('wetlands').filter((r) => r.iso3 === cur.iso3).sort((a, b) => b.extent_km2 - a.extent_km2);
      hbars($('#wetchart'), wet.map((r) => ({ label: `${r.wetland_group} · ${fmtKm(r.extent_km2)} km²`, total: r.covered_pct,
        parts: [{ v: r.pa_km2 / r.extent_km2 * 100, c: C[0] }, { v: r.oecm_km2 / r.extent_km2 * 100, c: C[1] }],
        tip: [r.wetland_group, `${fmtPct(r.covered_pct, 1)} covered`, `PAs ${fmtKm(r.pa_km2)} km², OECMs ${fmtKm(r.oecm_km2)} km²`] })));
      const GOVC = { Government: WWF.green, Shared: WWF.orange, Private: WWF.berry, 'Indigenous peoples & local communities': WWF.brown, 'Not reported': WWF.grey };
      const PAMEC = { 'Assessed, current (no score)': WWF.green, 'Assessment outdated': WWF.orange, 'Not assessed': WWF.grey };
      const gv = rowsOf('governance').filter((r) => r.iso3 === cur.iso3), pm = rowsOf('effectiveness').filter((r) => r.iso3 === cur.iso3);
      stack100($('#govchart'), [
        { title: 'Governance type', parts: Object.keys(GOVC).map((k) => { const r = gv.find((x) => x.governance === k); return { name: k, v: r ? r.share_of_covered_land : 0, sites: r ? r.sites : 0, c: GOVC[k] }; }) },
        { title: 'Management effectiveness', parts: Object.keys(PAMEC).map((k) => { const r = pm.find((x) => x.effectiveness === k); return { name: k, v: r ? r.share_of_covered_land : 0, sites: r ? r.sites : 0, c: PAMEC[k] }; }) },
      ]);
      // KBA table
      const KG = [['all', 'All'], ['marine', 'Marine'], ['freshwater', 'Freshwater'], ['mountain', 'Mountain'], ['None', 'Not covered'], ['Partial', 'Partly covered'], ['Complete', 'Complete']];
      chips($('#kba-chips'), KG, p.kbagroup, (v) => dash.setParams({ kbagroup: v }));
      let kr = kbas.filter((r) => r.iso3 === cur.iso3);
      if (['marine', 'freshwater', 'mountain'].includes(p.kbagroup)) kr = kr.filter((r) => r[p.kbagroup] === 'Y');
      if (['None', 'Partial', 'Complete'].includes(p.kbagroup)) kr = kr.filter((r) => r.coverage_class === p.kbagroup);
      if (local.kbaq) kr = kr.filter((r) => r.kba.toLowerCase().includes(local.kbaq));
      $('#kba-count').textContent = `${kr.length} of ${kbas.filter((r) => r.iso3 === cur.iso3).length} KBAs shown, mean coverage ${fmtPct(d3.mean(kr, (r) => r.covered_pct) || 0, 1)}`;
      table('#kbatable', kr, [['sitrecid'], ['kba'], ['area_km2', (r) => d3.format(',.1f')(r.area_km2), 'n'], ['covered_pct', (r) => barCell(r.covered_pct, kbaFill(r.covered_pct)), 'n'],
        ['pa_only_pct', (r) => fmtPct(r.pa_only_pct, 1), 'n'], ['coverage_class', (r) => pill(r.coverage_class)], ['marine'], ['freshwater'], ['mountain']], local.kbasort, 'sitrecid');
      // site table
      const SF = [['all', 'All'], ['PA', 'Protected areas'], ['OECM', 'OECMs'], ['counted', 'Counted'], ['excluded', 'Excluded']];
      chips($('#site-chips'), SF, p.sitefilter, (v) => dash.setParams({ sitefilter: v }));
      let sr = rowsOf('sites').filter((r) => r.iso3 === cur.iso3);
      const total = sr.length;
      if (p.sitefilter === 'PA' || p.sitefilter === 'OECM') sr = sr.filter((r) => r.site_type === p.sitefilter);
      if (p.sitefilter === 'counted') sr = sr.filter((r) => r.counted === 'Yes');
      if (p.sitefilter === 'excluded') sr = sr.filter((r) => r.counted === 'No');
      if (local.siteq) sr = sr.filter((r) => (r.site + ' ' + r.designation).toLowerCase().includes(local.siteq));
      $('#site-count').textContent = `${sr.length} of ${total} records shown`;
      table('#sitetable', sr, [['site_id'], ['site'], ['designation'], ['site_type'], ['year', null, 'n'], ['counted', (r) => pill(r.counted)],
        ['net_land_km2', (r) => (r.net_land_km2 == null ? (r.exclusion || '') : d3.format(',.2f')(r.net_land_km2)), 'n'],
        ['net_sea_km2', (r) => (r.net_sea_km2 == null ? '' : d3.format(',.2f')(r.net_sea_km2)), 'n'], ['governance'], ['effectiveness_year', null, 'n']], local.sitesort, 'site_id');
      if (lastIso !== cur.iso3) { lastIso = cur.iso3; }
    }

    if (tab === 'oecm') window.oecmDraw?.(geo);

    if (tab === 'compare') {
      const ts = rowsOf('timeseries');
      stepLines($('#tsall'), ISO.map((i, j) => ({ name: by[i].country, c: COUNTRY_C[i], pts: ts.filter((r) => r.iso3 === i).map((r) => ({ year: r.year, v: r.land_pct })) })), 60);
      const cats = ISO.map((i) => ({ key: i, label: by[i].country }));
      groupedBars($('#kbagroups'), cats.map((c) => ({ ...c, vals: { m: by[c.key].kba_marine_pct, f: by[c.key].kba_freshwater_pct, t: by[c.key].kba_mountain_pct } })),
        [{ key: 'm', name: 'Marine', c: WWF.blue }, { key: 'f', name: 'Freshwater', c: WWF.aqua }, { key: 't', name: 'Mountain', c: WWF.brown }], 80);
      groupedBars($('#inland'), cats.map((c) => ({ ...c, vals: { r: by[c.key].rivers_pct, w: by[c.key].wetlands_pct } })),
        [{ key: 'r', name: 'River length', c: WWF.blue }, { key: 'w', name: 'Lakes and wetlands', c: WWF.aqua }], 60, { target: true });
      groupedBars($('#dataq'), cats.map((c) => ({ ...c, vals: { g: by[c.key].gov_not_reported_pct, p: by[c.key].pame_current_pct } })),
        [{ key: 'g', name: 'No governance type', c: WWF.red }, { key: 'p', name: 'Current evaluation', c: WWF.green }], 60);
      // Protected Planet dot plot
      const el = $('#ppcheck'), w = Math.max(280, el.clientWidth), h = ISO.length * 34 + 26, left = 70;
      const svg = svgIn(el, w, h), x = d3.scaleLinear([0, 60], [left, w - 50]);
      svg.append('g').attr('transform', `translate(0,${h - 20})`).call(d3.axisBottom(x).ticks(6).tickFormat((d) => d + '%')).call(axisStyle);
      const tip = tipIn(el);
      ISO.forEach((i, j) => {
        const r = by[i], y = j * 34 + 14;
        svg.append('text').attr('x', left - 8).attr('y', y + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(r.country);
        svg.append('line').attr('x1', x(Math.min(r.land_pct, r.pp_land_pct))).attr('x2', x(Math.max(r.land_pct, r.pp_land_pct))).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-axis)');
        svg.append('circle').attr('cx', x(r.pp_land_pct)).attr('cy', y).attr('r', 7).attr('fill', 'none').attr('stroke', WWF.berry).attr('stroke-width', 2);
        svg.append('circle').attr('cx', x(r.land_pct)).attr('cy', y).attr('r', 4.5).attr('fill', C[0])
          .on('mousemove', (ev) => tip.show(ev, [r.country, `This analysis ${fmtPct(r.land_pct)}`, `Protected Planet ${fmtPct(r.pp_land_pct)}`])).on('mouseleave', () => tip.hide());
        svg.append('text').attr('x', x(Math.max(r.land_pct, r.pp_land_pct)) + 12).attr('y', y + 4).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)')
          .text(`${fmtPct(r.land_pct)} vs ${fmtPct(r.pp_land_pct)}`);
      });
      const eco = rowsOf('ecoregions').filter((r) => r.realm === 'Land' && r.extent_km2 >= 5000).sort((a, b) => a.covered_pct - b.covered_pct).slice(0, 12);
      hbars($('#ecoall'), eco.map((r) => ({ label: `${r.ecoregion} · ${r.country}`, total: r.covered_pct,
        parts: [{ v: r.pa_km2 / r.extent_km2 * 100, c: C[0] }, { v: r.oecm_km2 / r.extent_km2 * 100, c: C[1] }],
        tip: [`${r.ecoregion}, ${r.country}`, `${fmtPct(r.covered_pct, 1)} of ${fmtKm(r.extent_km2)} km²`] })));
    }

    if (tab === 'report') {
      const out = [];
      const sc = (t) => { const h = document.createElement('h3'); h.className = 'scope'; h.textContent = t; return h; };
      out.push(sc('The region'), ...narr.filter((n) => n.scope === 'REGION').map(para));
      ISO.forEach((i) => {
        const r = by[i];
        out.push(sc(r.country), ...narr.filter((n) => n.scope === i).map(para));
        const s = document.createElement('section'); const p1 = document.createElement('p'); p1.className = 'muted';
        p1.textContent = `National figure: ${r.national_figure}. National target: ${r.national_target}. Base map: ${r.base_map} `;
        const a = document.createElement('a'); a.href = r.guide_url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `Open the full ${r.country} guide`;
        p1.append(a); s.append(p1); out.push(s);
      });
      $('#fullreport').replaceChildren(...out);
    }
  }

  dash.onData(draw);
  window.oecmShowTab = (t) => showTab(t);
  const named = location.hash.slice(1).split('/')[0];
  if (['overview', 'country', 'oecm', 'compare', 'report', 'methodology'].includes(named)) showTab(named, false);
})();
