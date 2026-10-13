/* OECM opportunities page (wwf_site_oecm only).
   Data: data/oecm_*.json, built by ../build_oecm_data.py from <country>/06_oecm/outputs.
   Maps use the same frame as geo.json: Mollweide kilometres, y flipped. app.js calls window.oecmDraw(geo) when the tab is shown. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : null; };
  const f0 = d3.format(',.0f'), f1 = d3.format(',.1f'), f2 = d3.format('.2f');
  const fHa = (ha) => (ha == null ? '–' : ha >= 100000 ? `${f0(ha / 100)} km²` : ha >= 1000 ? `${f1(ha / 100)} km²` : ha >= 10 ? `${f0(ha)} ha` : `${f1(ha)} ha`);
  const fPp = (v) => (v == null ? '–' : v > 0 && v < 0.001 ? '<0.001' : v < 0.1 ? d3.format('.3f')(v) : f2(v));
  const fPct = (v, d = 1) => (v == null || isNaN(v) ? '–' : d3.format(`.${d}f`)(v) + '%');

  const TIERS = ['P1', 'REPORT', 'P2', 'P3', 'COVERED', 'SMALL'];
  const TIER_O = { P1: 0, REPORT: 1, P2: 2, P3: 3, COVERED: 4, SMALL: 5 };
  const TIER_SHORT = { P1: 'Priority 1', REPORT: 'Reporting gap', P2: 'Priority 2', P3: 'Priority 3', COVERED: 'Already covered', SMALL: 'Too small' };
  const TIER_C = { P1: 'var(--wwf-orange)', REPORT: 'var(--wwf-blue)', P2: 'var(--wwf-yellow)', P3: 'var(--wwf-grey-40)', COVERED: 'var(--wwf-grey-20)', SMALL: 'var(--wwf-grey-20)' };
  const TIER_FO = { P1: 0.85, REPORT: 0.6, P2: 0.75, P3: 0.35, COVERED: 0.25, SMALL: 0.25 };
  const VIEWS = { P1: ['P1', 'REPORT'], P12: ['P1', 'REPORT', 'P2'], P123: ['P1', 'REPORT', 'P2', 'P3'], all: ['P1', 'REPORT', 'P2', 'P3', 'COVERED', 'SMALL'] };
  const CAT = {
    fisheries: ['Fisheries closures', 'var(--wwf-blue)'], military: ['Military areas', 'var(--wwf-dark-brown)'], hunting: ['Hunting reserves', 'var(--wwf-brown)'],
    water: ['Dams & reservoirs', 'var(--wwf-aqua)'], oases: ['Traditional oases', 'var(--wwf-olive)'], sacred: ['Sacred natural sites', 'var(--wwf-berry)'],
    archaeological: ['Archaeological sites', 'var(--wwf-red-violet)'], cultural: ['Cultural & historic sites', 'var(--wwf-grey-80)'],
  };
  const ST_C = { met: 'var(--wwf-green)', likely: 'var(--wwf-medium-green)', partly: 'var(--wwf-orange)', uncertain: '#c9a800', unlikely: 'var(--wwf-red)', 'not met': 'var(--wwf-red)' };
  const LC = { 10: ['Tree cover', '#006400'], 20: ['Shrubland', '#ffbb22'], 30: ['Grassland', '#ffff4c'], 40: ['Cropland', '#f096ff'], 50: ['Built-up', '#fa0000'],
    60: ['Bare / sparse', '#b4b4b4'], 80: ['Open water', '#0064c8'], 90: ['Herbaceous wetland', '#0096a0'], 95: ['Mangroves', '#00cf75'], 100: ['Moss & lichen', '#fae6a0'] };

  const st = {
    iso: 'TUN', view: 'P12', tiers: new Set(['P1', 'REPORT', 'P2']), cats: new Set(Object.keys(CAT)), cat: 'all', layers: new Set(['kba', 'gap', 'pa', 'dots']),
    sel: null, pin: null, ttier: 'P12', tq: '', tsort: ['rank', 1], kfilter: 'gap', ksort: ['gap_km2', -1], built: null,
  };
  let D = null;           // data for the current country
  let main = null;        // main map
  let geoAll = null;

  // ------------------------------------------------------------------ small helpers
  const chips = (box, items, isOn, onPick) => {
    box.replaceChildren(...items.map(([v, label, color]) => {
      const b = el('button', 'na-chip', label); b.type = 'button'; b.setAttribute('aria-pressed', String(isOn(v)));
      if (color) { const i = el('i', 'oe-chipdot'); i.style.cssText = `display:inline-block;width:.6rem;height:.6rem;margin-right:.3rem;background:${color}`; b.prepend(i); }
      b.addEventListener('click', () => onPick(v)); return b;
    }));
  };
  const tierBadge = (t) => el('span', 'oe-tier ' + t, TIER_SHORT[t] || t);
  const tipIn = (box) => {
    let t = box.querySelector(':scope > .na-tip');
    if (!t) { t = el('div', 'na-tip'); t.hidden = true; box.appendChild(t); }
    return {
      show(ev, lines) {
        t.replaceChildren(...lines.map((l, i) => el('div', i === 0 ? 't' : null, l))); t.hidden = false;
        const r = box.getBoundingClientRect();
        let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
        if (x + t.offsetWidth > r.width) x = Math.max(0, ev.clientX - r.left - t.offsetWidth - 14);
        if (y + t.offsetHeight > r.height) y = Math.max(0, ev.clientY - r.top - t.offsetHeight - 14);
        t.style.left = x + 'px'; t.style.top = y + 'px';
      },
      hide() { t.hidden = true; },
    };
  };
  const sortRows = (rs, [k, dir]) => [...rs].sort((a, b) => {
    const va = a[k], vb = b[k];
    if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
    return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
  });
  const sortHead = (sel, key) => $$(sel + ' th button').forEach((b) => {
    if (b.dataset.bound) return; b.dataset.bound = '1';
    b.addEventListener('click', () => { const [k, d] = st[key]; st[key] = [b.dataset.k, k === b.dataset.k ? -d : (b.closest('th').classList.contains('n') ? -1 : 1)]; renderTables(); });
  });
  const scaleBar = (box, k) => {
    if (!box) return;
    const target = 110 / k, p = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((m) => m * p).filter((v) => v <= target).pop() || p;
    box.replaceChildren(Object.assign(el('i'), { style: `width:${nice * k}px` }), el('span', null, nice >= 1 ? `${nice} km` : `${Math.round(nice * 1000)} m`));
  };

  // ------------------------------------------------------------------ data for one country
  const prepare = (iso) => {
    const summ = (rows('oecm_summary') || []).find((r) => r.iso3 === iso);
    if (!summ) return null;
    const cx = rows('oecm_complexes').filter((r) => r.iso3 === iso).map((r) => ({ ...r, tier_o: TIER_O[r.tier], measures_s: r.measures.join('; '),
      kba_s: r.kba_names.join('; '), q: [r.name, r.governorate, r.measures.join(' '), r.kba_names.join(' '), r.categories.join(' ')].join(' ').toLowerCase() }));
    const byCid = Object.fromEntries(cx.map((r) => [r.cid, r]));
    const shapes = rows('oecm_shapes').filter((r) => r.iso3 === iso);
    const kbas = rows('oecm_kbas').filter((r) => r.iso3 === iso);
    const kbaById = Object.fromEntries(kbas.map((k) => [k.sitrecid, k]));
    const pas = rows('oecm_pas').filter((r) => r.iso3 === iso);
    const meas = Object.fromEntries(summ.measures.map((m) => [m.label, m]));
    // marker position of each complex: area-weighted centre of its member shapes
    const ctr = {};
    shapes.forEach((s) => { const c = ctr[s.cid] || (ctr[s.cid] = { x: 0, y: 0, w: 0 }); const w = Math.max(0.01, s.ha || 0.01); c.x += s.cx * w; c.y += s.cy * w; c.w += w; });
    Object.values(ctr).forEach((c) => { c.x /= c.w; c.y /= c.w; });
    const order = cx.filter((r) => TIER_O[r.tier] <= 3).sort((a, b) => a.rank - b.rank).map((r) => r.cid);
    return { iso, summ, cx, byCid, shapes, kbas, kbaById, pas, meas, ctr, order };
  };

  // ------------------------------------------------------------------ figures, recommendations, charts
  const drawHead = () => {
    const s = D.summ;
    $('#oe-title').textContent = `${s.country}: which sites could become OECMs?`;
    $('#oe-n-cand').textContent = d3.format(',')(s.n_candidates);
    const kpi = (l, v, sub) => { const d = el('div', 'na-kpi'); d.append(el('span', 'l', l), el('span', 'v', v), el('span', 'l', sub)); return d; };
    const t = s.tiers;
    $('#oe-kpis').replaceChildren(
      kpi('Land counted today', fPct(s.covered_land_pct, 2), `${f0(s.land_gap_km2)} km² short of 30%`),
      kpi('Sea counted today', fPct(s.covered_sea_pct, 2), `${f0(s.sea_gap_km2)} km² short of 30%`),
      kpi('Priority 1 complexes', String(t.P1.n), `+ ${t.REPORT.n} marine zones to report to the WDPA`),
      kpi('Priority 1 + 2 would add', `+${fPp(s.p12.pp_land)} / +${fPp(s.p12.pp_sea)}`, 'points of %, land / sea'),
      kpi('Priority 2 complexes', String(t.P2.n), 'assess case by case'),
      kpi('KBA gaps reached by P1 + P2', `${s.kbas_reached.p12} of ${s.n_kba_gaps}`, `${f0(s.p12.kba_km2)} km² of uncovered KBA`));
    $('#oe-recs-title').textContent = `What ${s.country} could do`;
    $('#oe-recs').replaceChildren(...s.recommendations.map((n) => { const x = el('section'); x.append(el('h3', null, n.heading), el('p', null, n.text)); return x; }));
  };

  const drawBars = () => {
    const s = D.summ, box = $('#oe-bars'), w = Math.max(300, box.clientWidth);
    const rs = [
      { name: 'Land', now: s.covered_land_pct, a: s.p1.pp_land, ab: s.p12.pp_land, all: s.all.pp_land },
      { name: 'Sea', now: s.covered_sea_pct, a: s.p1.pp_sea, ab: s.p12.pp_sea, all: s.all.pp_sea },
    ];
    const max = Math.max(40, Math.ceil(d3.max(rs, (r) => r.now + r.all) / 10) * 10);
    const left = 44, band = 70, h = rs.length * band + 24;
    box.querySelectorAll('svg').forEach((x) => x.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const x = d3.scaleLinear([0, max], [left, w - 12]);
    svg.append('g').attr('transform', `translate(0,${h - 20})`).call(d3.axisBottom(x).ticks(6).tickFormat((d) => d + '%'))
      .call((g) => g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)'))
      .call((g) => g.selectAll('.domain,.tick line').attr('stroke', 'var(--cds-chart-axis)'));
    svg.append('line').attr('x1', x(30)).attr('x2', x(30)).attr('y1', 0).attr('y2', h - 20).attr('stroke', 'var(--wwf-black)').attr('stroke-dasharray', '4 3');
    const tip = tipIn(box);
    rs.forEach((r, i) => {
      const y = i * band + 6;
      svg.append('text').attr('x', 0).attr('y', y + 17).style('font-size', 'var(--cds-font-size-caption)').style('font-weight', 600).text(r.name);
      let x0 = 0;
      [['Counted today', r.now, 'var(--wwf-green)'], ['Priority 1 + reporting', r.a, TIER_C.P1], ['Priority 2', r.ab - r.a, TIER_C.P2], ['Priority 3 (upper bound)', r.all - r.ab, TIER_C.P3]]
        .forEach(([label, v, c]) => {
          if (v <= 0) return;
          const shown = Math.min(v, max - x0);
          svg.append('rect').attr('x', x(x0)).attr('y', y + 4).attr('width', Math.max(1.5, x(x0 + shown) - x(x0))).attr('height', 20).attr('fill', c)
            .on('mousemove', (ev) => tip.show(ev, [`${r.name}: ${label}`, `${label === 'Counted today' ? '' : '+'}${fPp(v)} points of %`])).on('mouseleave', () => tip.hide());
          x0 += v;
        });
      svg.append('text').attr('x', left).attr('y', y + 42).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)')
        .text(`today ${fPct(r.now, 2)} → with P1 ${fPct(r.now + r.a, 2)} → with P1 + P2 ${fPct(r.now + r.ab, 1)} → all candidates ${fPct(r.now + r.all, 1)}`);
    });
    const lg = $('#oe-bars-legend'), it = (c, t) => { const sp = el('span'), i = el('i'); i.style.background = c; sp.append(i, t); return sp; };
    lg.replaceChildren(it('var(--wwf-green)', 'Counted today'), it(TIER_C.P1, 'Priority 1 and reporting gaps'), it(TIER_C.P2, 'Priority 2'), it(TIER_C.P3, 'Priority 3 (unlikely as they stand)'));
  };

  const drawFunnel = () => {
    const s = D.summ, t = s.tiers, box = $('#oe-funnel'), w = Math.max(300, box.clientWidth);
    const steps = [
      ['Candidate records mapped (polygons)', s.n_candidates, 'var(--wwf-black)'],
      ['Site complexes (same place grouped)', s.n_complexes, 'var(--wwf-grey-80)'],
      ['Adding area outside counted PAs', s.n_complexes - t.COVERED.n - t.SMALL.n, 'var(--wwf-grey-60)'],
      ['Priority 1 or 2 (incl. reporting gaps)', t.P1.n + t.P2.n + t.REPORT.n, TIER_C.P2],
      ['Priority 1 (incl. reporting gaps)', t.P1.n + t.REPORT.n, TIER_C.P1],
    ];
    const max = steps[0][1], rowH = 30, h = steps.length * rowH + 4;
    box.querySelectorAll('svg').forEach((x) => x.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const x = d3.scaleSqrt([0, max], [0, w * 0.55]);
    steps.forEach(([label, n, c], i) => {
      const y = i * rowH, bw = Math.max(3, x(n));
      svg.append('rect').attr('x', 0).attr('y', y + 4).attr('width', bw).attr('height', rowH - 8).attr('fill', c);
      svg.append('text').attr('x', bw + 6).attr('y', y + rowH / 2 + 4).style('font-size', 'var(--cds-font-size-caption)')
        .call((t2) => { t2.append('tspan').style('font-weight', 700).text(d3.format(',')(n) + ' '); t2.append('tspan').attr('fill', 'var(--color-fg-muted)').text(label); });
    });
  };

  // ------------------------------------------------------------------ main map
  const buildMain = (geo) => {
    const box = $('#oe-map'), w = Math.max(300, box.clientWidth), h = Math.max(420, Math.round(w * 0.7));
    if (main && main.w === w && main.iso === D.iso) return false;
    box.querySelectorAll(':scope > svg').forEach((x) => x.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const g = svg.append('g');
    const L = {}; ['base', 'pa', 'kbagap', 'sites', 'kba', 'dots'].forEach((k) => (L[k] = g.append('g').attr('class', 'oe-l-' + k)));
    const iso = D.iso;
    L.base.selectAll('path.sea').data(geo.filter((r) => r.layer === 'sea' && r.iso3 === iso)).join('path').attr('class', 'sea').attr('d', (r) => r.d).attr('fill', 'var(--wwf-blue-10)');
    L.base.selectAll('path.other').data(geo.filter((r) => r.layer === 'land' && r.iso3 !== iso)).join('path').attr('class', 'land other').attr('d', (r) => r.d);
    const land = L.base.selectAll('path.this').data(geo.filter((r) => r.layer === 'land' && r.iso3 === iso)).join('path').attr('class', 'land this').attr('d', (r) => r.d);
    L.pa.selectAll('path').data(D.pas).join('path').attr('d', (r) => r.d).attr('fill', 'var(--wwf-green)').attr('fill-opacity', 0.28).attr('stroke', 'var(--wwf-green)').attr('stroke-width', 0.6).style('pointer-events', 'none');
    L.kbagap.selectAll('path').data(D.kbas.filter((k) => k.gap_d)).join('path').attr('d', (k) => k.gap_d).attr('fill', 'var(--wwf-berry)').attr('fill-opacity', 0.14).style('pointer-events', 'none');
    L.kba.selectAll('path').data(D.kbas).join('path').attr('class', 'oe-kba').attr('d', (k) => k.d).attr('fill', 'none').attr('stroke', 'var(--wwf-berry)').attr('stroke-width', 1.1)
      .attr('stroke-dasharray', '4 2').style('pointer-events', 'none');
    const shp = [...D.shapes].sort((a, b) => (b.ha || 0) - (a.ha || 0));
    L.sites.selectAll('path').data(shp, (s) => s.uid).join('path').attr('class', 'oe-site').attr('d', (s) => s.d)
      .attr('fill', (s) => TIER_C[s.tier]).attr('fill-opacity', (s) => ((s.ha || 0) > 20000 ? 0.2 : TIER_FO[s.tier]))
      .attr('stroke', (s) => ((s.ha || 0) > 20000 ? TIER_C[s.tier] : s.tier === 'P3' || s.tier === 'COVERED' || s.tier === 'SMALL' ? 'var(--wwf-grey-60)' : 'var(--wwf-black)'))
      .attr('stroke-width', (s) => ((s.ha || 0) > 20000 ? 1.4 : 0.6)).attr('stroke-opacity', 0.8);
    // markers: drawn at a constant screen size (scaled by 1/k on zoom); priority 1 and reporting gaps carry their rank
    const dotRows = D.cx.filter((c) => ['P1', 'REPORT', 'P2'].includes(c.tier) && D.ctr[c.cid]).sort((a, b) => b.rank - a.rank);
    const mk = L.dots.selectAll('g.oe-mk').data(dotRows, (c) => c.cid).join('g').attr('class', (c) => 'oe-mk oe-mk-' + c.tier);
    mk.append('circle').attr('class', 'oe-dot').attr('r', (c) => (c.tier === 'P2' ? 5 : 10)).attr('fill', (c) => TIER_C[c.tier])
      .attr('stroke', 'var(--wwf-black)').attr('stroke-width', 1.2);
    mk.filter((c) => c.tier !== 'P2').append('text').attr('class', 'oe-mk-n').attr('text-anchor', 'middle').attr('dy', '0.35em')
      .text((c) => c.rank).style('pointer-events', 'none');
    L.halo = g.append('circle').attr('class', 'oe-halo').attr('fill', 'none').attr('stroke', 'var(--wwf-black)').attr('stroke-width', 2).attr('stroke-dasharray', '4 3').style('pointer-events', 'none');
    const tip = tipIn(box);
    const zoom = d3.zoom().scaleExtent([0.3, 6000]).on('zoom', (ev) => { g.attr('transform', ev.transform); main.k = ev.transform.k; resize(); tip.hide(); });
    svg.call(zoom).on('dblclick.zoom', null);
    const resize = () => {
      const k = main.k || 1;
      L.dots.selectAll('g.oe-mk').attr('transform', (c) => `translate(${D.ctr[c.cid].x},${D.ctr[c.cid].y}) scale(${1 / k})`)
        // a priority-2 marker steps aside once its site is big enough on screen to click
        .attr('opacity', (c) => (c.tier === 'P2' && Math.sqrt((c.net_ha || 0) / 100) * k > 40 ? 0 : 1))
        .style('pointer-events', (c) => (c.tier === 'P2' && Math.sqrt((c.net_ha || 0) / 100) * k > 40 ? 'none' : null));
      placeHalo();
      scaleBar($('#oe-scale'), k);
    };
    // hover and click (delegated)
    const info = (ev) => {
      const t = ev.target, d = t.__data__;
      if (!d) return null;
      if (t.classList.contains('oe-site')) return { cid: d.cid, uid: d.uid };
      if (t.classList.contains('oe-dot')) return { cid: (d || t.parentNode.__data__).cid };
      return null;
    };
    svg.on('mousemove.oe', (ev) => {
      const i = info(ev);
      if (!i) { tip.hide(); return; }
      const c = D.byCid[i.cid];
      if (!c) return;
      const s = i.uid && D.shapes.find((x) => x.uid === i.uid);
      tip.show(ev, [`${TIER_SHORT[c.tier]} · #${c.rank}`, c.name, `${c.measures.slice(0, 2).join(', ')} · ${fHa(c.net_ha)} outside PAs`
        + (c.kba_names.length ? ` · KBA ${c.kba_names[0]}` : ''), c.n_members > 1 && s ? `${c.n_members} records of the same place` : 'Click for the full profile']);
    }).on('mouseleave.oe', () => tip.hide())
      .on('click.oe', (ev) => { const i = info(ev); if (!i) return; tip.hide(); select(i.cid, { from: 'map' }); });
    const placeHalo = () => {
      const c = st.sel && D.ctr[st.sel], cc = st.sel && D.byCid[st.sel];
      const shown = cc && (st.pin === st.sel || (st.tiers.has(cc.tier) && cc.categories.some((x) => st.cats.has(x))));
      if (!c || !cc || !shown) { L.halo.attr('display', 'none'); return; }
      L.halo.attr('display', null).attr('cx', c.x).attr('cy', c.y).attr('r', 18 / (main.k || 1)).attr('stroke-width', 2 / (main.k || 1));
    };
    main = { w, h, svg, g, L, zoom, iso: D.iso, k: 1, land, resize, tip, placeHalo };
    fitMain(land.node());
    applyFilters();
    return true;
  };
  const fitMain = (node, pad = 0.92, maxK = 3000) => {
    if (!node) return;
    const b = node.getBBox(); if (!b.width && !b.height) return;
    const k = Math.min(maxK, Math.min(main.w / Math.max(b.width, 0.05), main.h / Math.max(b.height, 0.05)) * pad);
    main.svg.transition().duration(600).call(main.zoom.transform, d3.zoomIdentity.translate(main.w / 2 - k * (b.x + b.width / 2), main.h / 2 - k * (b.y + b.height / 2)).scale(k));
  };
  const fitBox = (m, b, pad = 0.9, maxK = 3000, anim = true) => {
    const bw = Math.max(b.width, 0.4), bh = Math.max(b.height, 0.4);
    const k = Math.min(maxK, Math.min(m.w / bw, m.h / bh) * pad);
    const t = d3.zoomIdentity.translate(m.w / 2 - k * (b.x + b.width / 2), m.h / 2 - k * (b.y + b.height / 2)).scale(k);
    (anim ? m.svg.transition().duration(600) : m.svg).call(m.zoom.transform, t);
  };
  const bboxOf = (nodes) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach((n) => { const b = n.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
    return isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  };
  const applyFilters = () => {
    if (!main) return;
    const L = main.L, on = st.layers;
    L.sites.selectAll('path').attr('display', (s) => ((st.tiers.has(s.tier) && st.cats.has(s.cat)) || s.cid === st.pin ? null : 'none'));
    L.dots.attr('display', on.has('dots') ? null : 'none');
    L.dots.selectAll('g.oe-mk').attr('display', (c) => ((st.tiers.has(c.tier) && c.categories.some((x) => st.cats.has(x))) || c.cid === st.pin ? null : 'none'));
    L.pa.attr('display', on.has('pa') ? null : 'none');
    L.kba.attr('display', on.has('kba') ? null : 'none');
    L.kbagap.attr('display', on.has('gap') ? null : 'none');
    highlight();
  };
  const highlight = () => {
    if (!main) return;
    main.L.sites.selectAll('path').classed('oe-sel', (s) => s.cid === st.sel);
    main.L.sites.selectAll('path.oe-sel').raise();
    main.L.dots.selectAll('g.oe-mk').classed('oe-mk-sel', (c) => c.cid === st.sel).filter((c) => c.cid === st.sel).raise();
    main.placeHalo();
  };
  const drawLegend = () => {
    const it = (c, o, t, line) => { const sp = el('span'), i = el('i'); if (line) { i.style.border = `2px dashed ${c}`; i.style.background = 'transparent'; } else { i.style.background = c; i.style.opacity = o; } sp.append(i, t); return sp; };
    const num = (c, t) => { const sp = el('span'), i = el('b', 'oe-p1n', '1'); i.style.background = c; sp.append(i, t); return sp; };
    $('#oe-legend').replaceChildren(num(TIER_C.P1, 'Priority 1 (rank)'), num(TIER_C.REPORT, 'Reporting gap (marine PA zone)'), it(TIER_C.P2, 0.75, 'Priority 2'),
      it(TIER_C.P3, 0.4, 'Priority 3'), it(TIER_C.SMALL, 0.6, 'Already covered / too small'), it('var(--wwf-green)', 0.35, 'Counted protected areas'),
      it('var(--wwf-berry)', 1, 'KBA outline', true), it('var(--wwf-berry)', 0.18, 'KBA part not covered today'));
  };
  const mapCard = (title, body, actions) => {
    const box = $('#oe-map');
    let c = box.querySelector('.map-card');
    if (!c) { c = el('div', 'map-card'); box.appendChild(c); }
    const head = el('div', 'mc-head'), close = el('button', 'mc-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.addEventListener('click', () => { c.hidden = true; main.L.kba.selectAll('path').classed('oe-kbahl', false); });
    head.append(el('b', null, title), close);
    const list = el('div', 'mc-list'); list.append(...body);
    if (actions) list.append(actions);
    c.replaceChildren(head, list); c.hidden = false;
  };
  const kbaCard = (k) => {
    main.L.kba.selectAll('path').classed('oe-kbahl', (x) => x.sitrecid === k.sitrecid);
    const it = el('section', 'mc-item'); it.append(el('span', 'mc-badge kba', 'KBA'), el('h4', null, k.kba));
    const dl = el('dl'); const kv = (a, b) => { if (b != null && b !== '') dl.append(el('dt', null, a), el('dd', null, String(b))); };
    kv('Class', k.kba_class); kv('Area', `${f1(k.area_km2)} km²`); kv('Covered today', fPct(k.covered_pct)); kv('Not covered', `${f1(k.gap_km2)} km²`);
    kv('Priority 1 would fill', `${f1(k.p1_km2)} km² (${fPct(k.p1_pct_gap)} of the gap)`); kv('P1 + P2 would fill', `${f1(k.p12_km2)} km² (${fPct(k.p12_pct_gap)})`);
    kv('All candidates', `${f1(k.all_km2)} km² (${fPct(k.all_pct_gap)})`); kv('Threatened triggers', k.n_threatened ? `${k.n_threatened}: ${k.threatened}` : 'none listed');
    it.append(dl, el('p', 'mc-note', k.verdict));
    const items = [it];
    if (k.complexes?.length) {
      const sec = el('section', 'mc-item'); sec.append(el('h4', null, 'Candidate complexes in this KBA'));
      const ul = el('ul', 'oe-list'); ul.style.fontSize = '.85rem';
      k.complexes.forEach((c) => { const li = el('li'); const a = el('a', null, `${c.name}`); a.href = `#oecm/${c.cid}`; a.addEventListener('click', (e) => { e.preventDefault(); select(c.cid, { from: 'list', scroll: true }); });
        li.append(tierBadge(c.tier), ' ', a, ` · ${fHa(c.ha)}`); ul.append(li); });
      sec.append(ul); items.push(sec);
    }
    if (k.url) { const a = el('a', null, 'KBA factsheet ↗'); a.href = k.url; a.target = '_blank'; a.rel = 'noopener'; const s2 = el('section', 'mc-item'); s2.append(a); items.push(s2); }
    mapCard('Key Biodiversity Area', items);
    const node = main.L.kba.selectAll('path').filter((x) => x.sitrecid === k.sitrecid).node();
    if (node) fitBox(main, node.getBBox(), 0.85);
  };

  // ------------------------------------------------------------------ selection and profile
  const select = (cid, opts = {}) => {
    const c = D.byCid[cid]; if (!c) return;
    st.sel = cid; st.pin = cid;
    highlight();
    renderProfile(c);
    try { history.replaceState(null, '', `#oecm/${cid}`); } catch (e) {}
    $$('#oe-table tbody tr').forEach((tr) => tr.classList.toggle('oe-cur', tr.dataset.cid === cid));
    if (main) {
      applyFilters();      // the selected site is drawn even when the filters hide its priority or category
      const nodes = main.L.sites.selectAll('path').filter((s) => s.cid === cid).nodes();
      const b = bboxOf(nodes);
      const onScreen = b ? Math.max(b.width, b.height) * (main.k || 1) : 0;
      if (b && (opts.from !== 'map' || onScreen < 30)) {
        const pad = Math.max(b.width, b.height) * 1.5 + 2;           // some context around the site
        fitBox(main, { x: b.x - pad / 2, y: b.y - pad / 2, width: b.width + pad, height: b.height + pad }, 0.9, 2000);
      }
      const it = el('section', 'mc-item'); it.append(tierBadge(c.tier), el('h4', null, `#${c.rank} ${c.name}`), el('p', 'mc-note', c.headline));
      if (!st.tiers.has(c.tier) || !c.categories.some((x) => st.cats.has(x)))
        it.append(el('p', 'oe-note', 'Shown because you selected it; your current filters hide sites of this priority or category.'));
      const btn = el('button', 'na-chip', 'Open the full profile ↓'); btn.type = 'button'; btn.addEventListener('click', () => $('#oe-profile').scrollIntoView({ behavior: 'smooth' }));
      const act = el('section', 'mc-item'); act.append(btn);
      mapCard(TIER_SHORT[c.tier], [it], act);
    }
    $$('#oe-p1list button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cid === cid)));
    if (opts.scroll) $('#oe-profile').scrollIntoView({ behavior: 'smooth' });
  };

  const renderProfile = (c) => {
    const P = $('#oe-profile'), a = c.arg || {}, s = D.summ;
    const head = el('div', 'oe-ph'), hl = el('div', 'oe-ph-l');
    const h2 = el('h2'); h2.append(el('span', 'oe-rank', `#${c.rank}`), c.name);
    const sub = el('div', 'oe-sub', [c.governorate && `${c.governorate} governorate`, c.categories.map((x) => CAT[x]?.[0] || x).join(' + '),
      c.realm === 'sea' ? 'marine' : 'land', c.n_members > 1 ? `${c.n_members} records of the same place` : null, `${f2(c.lat)}° N, ${f2(c.lon)}° E`].filter(Boolean).join(' · '));
    const badges = el('div'); badges.append(tierBadge(c.tier)); badges.style.display = 'flex'; badges.style.gap = '.4rem';
    hl.append(badges, h2, sub);
    const nav = el('div', 'oe-nav'), i = D.order.indexOf(c.cid);
    const nb = (label, cid) => { const b = el('button', null, label); b.type = 'button'; b.disabled = !cid; if (cid) b.addEventListener('click', () => select(cid, {})); return b; };
    nav.append(nb('← Previous', D.order[i - 1]), nb('Next →', D.order[i + 1]));
    const copy = el('button', null, 'Copy link'); copy.type = 'button';
    copy.addEventListener('click', () => { try { navigator.clipboard.writeText(location.href); copy.textContent = 'Link copied'; setTimeout(() => (copy.textContent = 'Copy link'), 1500); } catch (e) {} });
    nav.append(copy);
    head.append(hl, nav);
    const kids = [head, el('p', 'oe-headline', c.headline)];
    kids[1].style.borderLeftColor = TIER_C[c.tier];

    const grid = el('div', 'oe-pgrid'), left = el('div', 'oe-sec'), right = el('div', 'oe-sec');
    // left: site map, figures, scores, land cover
    const pm = el('div', 'oe-pmap'); pm.id = 'oe-pmap';
    const pmScale = el('div', 'oe-scale'); pm.append(pmScale);
    const pmZoom = el('div', 'oe-zoom'); ['+', '−', '⌂'].forEach((t, j) => { const b = el('button', null, t); b.type = 'button'; b.dataset.z = ['in', 'out', 'reset'][j]; pmZoom.append(b); });
    pm.append(pmZoom);
    left.append(pm, el('p', 'oe-note', 'Selected complex outlined in black. Green: counted protected areas; dashed berry: KBA outlines; light berry: KBA part not covered today; other candidates in their priority colour.'));
    const figs = el('div', 'oe-figs');
    const fig = (v, l) => { const d = el('div', 'oe-fig'); d.append(el('b', null, v), el('span', null, l)); return d; };
    figs.append(fig(fHa(c.net_ha), 'outside counted PAs'), fig(`+${fPp(c.pp)}`, `points of % (${c.realm})`), fig(fHa(c.kba_ha), `in KBAs (${fPct((c.kba_share || 0) * 100, 0)})`),
      fig(c.natural == null ? '–' : fPct(c.natural * 100, 0), 'natural habitat index'), fig(c.score == null ? '–' : f2(c.score), 'screening score (0–1)'));
    left.append(figs);
    if (c.M != null) {
      const w = s.scoring.weights, sc = el('div', 'oe-scores');
      const srow = (label, v, color, note) => { const r = el('div', 'oe-srow'), t = el('span', 't'), b = el('i'); b.style.width = Math.min(100, v * 100) + '%'; b.style.setProperty('--c', color); t.append(b); r.append(el('span', null, label), t, el('span', null, f2(v))); if (note) r.title = note; return r; };
      sc.append(el('h3', null, 'Score breakdown'));
      sc.append(srow(`Measure ×${w.measure}`, c.M, 'var(--wwf-black)', 'Strength, permanence and mapping confidence of the measure'),
        srow(`Biodiversity ×${w.biodiversity}`, c.B, 'var(--wwf-berry)', 'KBA overlap (matched to habitat), natural habitat, ecoregion representation, connectivity'),
        srow(`  · KBA term`, c.K, 'var(--wwf-berry)'), srow(`  · Habitat term`, c.H, 'var(--wwf-green)'),
        srow(`Size ×${w.size}`, c.A, 'var(--wwf-blue)', 'log scale: 1 ha = 0.08, 100 ha = 0.5, 10,000 ha = 1'));
      if (c.stack_bonus) sc.append(srow('Stacked measures +', c.stack_bonus / 0.06, 'var(--wwf-orange)', `+${c.stack_bonus} for several categories on the same ground`));
      sc.append(el('p', 'oe-note', `Score ${f2(c.score)}: priority 1 from ${s.scoring.tiers.P1}, priority 2 from ${s.scoring.tiers.P2}, subject to the caps listed on the right.`));
      sc.style.setProperty('--c', 'var(--wwf-black)');
      left.append(sc);
    }
    if (c.lc && c.realm === 'land' && Object.keys(c.lc).length) {
      const box = el('div', 'oe-sec'); box.append(el('h3', null, 'Land cover (ESA WorldCover 2021)'));
      const bar = el('div', 'oe-lc'), lg = el('div', 'oe-lcl');
      Object.entries(c.lc).filter(([, v]) => v > 0.004).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => {
        const [n, col] = LC[k] || [k, '#999']; const i2 = el('i'); i2.style.width = v * 100 + '%'; i2.style.background = col; i2.title = `${n} ${fPct(v * 100, 0)}`; bar.append(i2);
        const sp = el('span'), sw = el('i'); sw.style.background = col; sp.append(sw, `${n} ${fPct(v * 100, 0)}`); lg.append(sp);
      });
      box.append(bar, lg); left.append(box);
    }
    // right: why, caps, criteria, KBAs, records, risks, next steps
    const list = (cls, items) => { const ul = el('ul', 'oe-list ' + cls); items.forEach((t) => ul.append(el('li', null, t))); return ul; };
    const sec = (title, color, ...body) => { const d = el('div', 'oe-sec'); const h = el('h3', null, title); d.style.setProperty('--c', color); d.append(h, ...body); return d; };
    if (a.why?.length) right.append(sec(c.tier === 'P3' ? 'What it has going for it' : 'Why it is a priority', 'var(--wwf-green)', list('why', a.why)));
    if (a.caps?.length) right.append(sec('What holds it back', 'var(--wwf-red)', list('caps', a.caps)));
    if (a.adds) right.append(sec('What it would add', 'var(--wwf-blue)', el('p', null, a.adds)));
    if (!c.arg) right.append(el('p', 'oe-note', c.tier === 'COVERED' ? 'Already inside counted protected areas: it would add nothing to indicator 3.1.' : 'Adds less than 1 ha outside counted protected areas: listed for completeness, not assessed further.'));
    grid.append(left, right);
    kids.push(grid);

    if (a.criteria) {
      const cr = el('div', 'oe-crit');
      a.criteria.forEach((x) => {
        const d = el('div', 'oe-c'); d.style.setProperty('--st', ST_C[x.status] || 'var(--wwf-grey-40)');
        const hh = el('header'); hh.append(el('b', null, `${x.key} · ${x.title}`), el('span', 'oe-st', x.status)); d.append(hh, el('p', null, x.text)); cr.append(d);
      });
      kids.push(sec('Against the OECM criteria (CBD Decision 14/8, Annex III)', 'var(--wwf-black)', cr));
    }
    if (c.kbas?.length) {
      const wrap = el('div', 'oe-two');
      c.kbas.forEach((k) => {
        const b = el('div', 'oe-kbabox'); const h4 = el('h4', null, `${k.name}`);
        b.append(h4, el('div', 'k', `${k.class} · ${f1(k.area_km2 || 0)} km² · covered today ${fPct(k.covered_pct)} · this complex: ${fHa(k.overlap_ha)}, ${fPct(k.pct_of_kba_gap)} of its uncovered part`));
        if (k.threatened?.length) { const sp = el('div', 'oe-spp'); k.threatened.forEach((t) => { const m = t.match(/^(.*) \((\w+)\)$/); const s2 = el('span', m ? m[2] : '', t); sp.append(s2); }); b.append(el('div', 'k', `Threatened trigger species (${k.n_threatened} of ${k.n_species}):`), sp); }
        else b.append(el('div', 'k', `${k.n_species} trigger species, none listed as threatened.`));
        if (k.description) b.append(el('p', null, k.description));
        if (k.habitats?.length) b.append(el('div', 'k', 'Habitats: ' + k.habitats.join(', ')));
        if (k.threats) b.append(el('div', 'k', 'Threats: ' + k.threats));
        const row = el('div', 'k');
        if (k.url) { const l = el('a', null, 'Factsheet ↗'); l.href = k.url; l.target = '_blank'; l.rel = 'noopener'; row.append(l, ' · '); }
        const show = el('a', null, 'Show on the map'); show.href = '#'; show.addEventListener('click', (e) => { e.preventDefault(); const kk = D.kbaById[k.sitrecid]; if (kk) { kbaCard(kk); $('#card-oe-map').scrollIntoView({ behavior: 'smooth' }); } });
        row.append(show); b.append(row); wrap.append(b);
      });
      kids.push(sec(`Key Biodiversity Area${c.kbas.length > 1 ? 's' : ''} it overlaps`, 'var(--wwf-berry)', wrap));
    }
    if (c.member_info?.length) {
      const t = el('table', 'oe-mt'), th = el('thead'), tr = el('tr');
      ['Record', 'Measure', 'Net area', 'In force', 'Legal basis / source'].forEach((x) => tr.append(el('th', null, x))); th.append(tr); t.append(th);
      const tb = el('tbody');
      c.member_info.forEach((m) => {
        const r = el('tr'), n = el('td');
        if (m.wiki_url) { const l = el('a', null, m.name); l.href = m.wiki_url; l.target = '_blank'; l.rel = 'noopener'; n.append(l); } else n.textContent = m.name;
        r.append(n, el('td', null, m.measure), el('td', null, fHa(m.net_ha)), el('td', null, [m.restrict, m.season].filter(Boolean).join(' · ')), el('td', null, m.legal_ref || m.descr || m.site_id));
        tb.append(r);
      });
      t.append(tb);
      const note = c.n_members > c.member_info.length ? el('p', 'oe-note', `${c.n_members - c.member_info.length} more records not listed.`) : null;
      kids.push(sec(c.n_members > 1 ? 'Records grouped in this complex' : 'Source record', 'var(--wwf-grey-60)', t, ...(note ? [note] : [])));
    }
    if (a.inside?.length) kids.push(sec('It also lies inside', 'var(--wwf-grey-60)', list('', a.inside.slice(0, 8))));
    if (a.criteria) {
      const ms = c.measures.map((m) => D.meas[m]).filter(Boolean);
      const auth = a.authority || [...new Set(ms.map((m) => m.authority))];
      const ev = a.evidence || [...new Set(ms.map((m) => m.evidence))];
      const nx = a.next || [...new Set(ms.map((m) => m.next))];
      const two = el('div', 'oe-two');
      two.append(sec('Risks and gaps', 'var(--wwf-red)', list('caps', a.risks || [])), sec('Evidence to collect', 'var(--wwf-orange)', list('', ev)));
      kids.push(two, sec('Next steps and who to involve', 'var(--wwf-green)', list('why', [...nx, `Authority: ${auth.join('; ')}${c.governorate ? ` (${c.governorate} governorate)` : ''}.`])));
    }
    kids.push(el('p', 'oe-note', 'Screening result from open data (OECM Harvester, WDPA/WD-OECM, World Database of KBAs, ESA WorldCover). It is a basis for discussion with the authorities, not an OECM assessment.'));
    P.replaceChildren(...kids);
    drawProfileMap(c, pm, pmScale, pmZoom);
  };

  const drawProfileMap = (c, box, scaleBox, zoomBox) => {
    const w = Math.max(280, box.clientWidth || 500), h = Math.round(w * 0.78);
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const g = svg.append('g');
    const geo = geoAll, iso = D.iso;
    g.selectAll('path.sea').data(geo.filter((r) => r.layer === 'sea' && r.iso3 === iso)).join('path').attr('d', (r) => r.d).attr('fill', 'var(--wwf-blue-10)');
    g.selectAll('path.other').data(geo.filter((r) => r.layer === 'land' && r.iso3 !== iso)).join('path').attr('class', 'land').attr('d', (r) => r.d).attr('fill', 'var(--wwf-map-dark)');
    g.selectAll('path.this').data(geo.filter((r) => r.layer === 'land' && r.iso3 === iso)).join('path').attr('class', 'land').attr('d', (r) => r.d).attr('fill', 'var(--wwf-map-light)');
    g.append('g').selectAll('path').data(D.pas).join('path').attr('d', (r) => r.d).attr('fill', 'var(--wwf-green)').attr('fill-opacity', 0.3).attr('stroke', 'var(--wwf-green)').attr('stroke-width', 0.8);
    const kb = c.kba_ids?.length ? D.kbas.filter((k) => c.kba_ids.includes(k.sitrecid)) : [];
    const ctr = D.ctr[c.cid];
    // other candidates near the complex (within ~60 km of its centre, or large enough to reach it)
    const near = ctr ? D.shapes.filter((s) => s.cid !== c.cid && Math.hypot(s.cx - ctr.x, s.cy - ctr.y) < 60 + Math.sqrt((s.ha || 0) / 100)) : [];
    const nearK = ctr ? D.kbas.filter((k) => !kb.includes(k) && k.lat != null) : [];
    g.append('g').selectAll('path').data(D.kbas.filter((k) => k.gap_d)).join('path').attr('d', (k) => k.gap_d).attr('fill', 'var(--wwf-berry)').attr('fill-opacity', 0.15);
    g.append('g').selectAll('path').data(near.sort((a2, b2) => (b2.ha || 0) - (a2.ha || 0))).join('path').attr('d', (s) => s.d)
      .attr('fill', (s) => TIER_C[s.tier]).attr('fill-opacity', (s) => TIER_FO[s.tier] * 0.8).attr('stroke', 'var(--wwf-grey-60)').attr('stroke-width', 0.5);
    g.append('g').selectAll('path').data(D.kbas).join('path').attr('d', (k) => k.d).attr('fill', 'none').attr('stroke', 'var(--wwf-berry)')
      .attr('stroke-width', (k) => (kb.includes(k) ? 1.8 : 1)).attr('stroke-dasharray', '4 2');
    const mine = D.shapes.filter((s) => s.cid === c.cid);
    const sel = g.append('g').selectAll('path').data(mine).join('path').attr('d', (s) => s.d).attr('fill', TIER_C[c.tier]).attr('fill-opacity', 0.85)
      .attr('stroke', 'var(--wwf-black)').attr('stroke-width', 2.2);
    const dot = g.append('circle').attr('fill', 'none').attr('stroke', 'var(--wwf-black)').attr('stroke-dasharray', '3 2');
    const tip = tipIn(box);
    g.selectAll('path').filter((d) => d && d.uid).on('mousemove', (ev, s) => { const cc = D.byCid[s.cid]; if (cc) tip.show(ev, [`${TIER_SHORT[cc.tier]} · #${cc.rank}`, cc.name, cc.measures.slice(0, 2).join(', ')]); })
      .on('mouseleave', () => tip.hide()).on('click', (ev, s) => { if (s.cid !== c.cid) { tip.hide(); select(s.cid, {}); } }).style('cursor', 'pointer');
    const m = { w, h, svg, zoom: null };
    m.zoom = d3.zoom().scaleExtent([0.3, 20000]).on('zoom', (ev) => {
      g.attr('transform', ev.transform); const k = ev.transform.k; scaleBar(scaleBox, k);
      if (ctr) dot.attr('cx', ctr.x).attr('cy', ctr.y).attr('r', 14 / k).attr('stroke-width', 1.2 / k);
    });
    svg.call(m.zoom).on('dblclick.zoom', null);
    const home = () => { const b = bboxOf(sel.nodes()); if (b) { const pad = Math.max(b.width, b.height) * 1.6 + 1.5; fitBox(m, { x: b.x - pad / 2, y: b.y - pad / 2, width: b.width + pad, height: b.height + pad }, 0.95, 20000, false); } };
    home();
    zoomBox.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.z === 'reset') home(); else svg.transition().duration(300).call(m.zoom.scaleBy, b.dataset.z === 'in' ? 2 : 0.5);
    }));
    void nearK;
  };

  // ------------------------------------------------------------------ tables
  const renderTables = () => {
    // priority list
    const TT = { P12: ['P1', 'REPORT', 'P2'], P1: ['P1', 'REPORT'], P2: ['P2'], P3: ['P3'], all: TIERS };
    chips($('#oe-ttier-chips'), [['P12', 'Priority 1 + 2'], ['P1', 'Priority 1 + reporting'], ['P2', 'Priority 2'], ['P3', 'Priority 3'], ['all', 'All complexes']],
      (v) => v === st.ttier, (v) => { st.ttier = v; renderTables(); });
    let r = D.cx.filter((c) => TT[st.ttier].includes(c.tier));
    if (st.tq) r = r.filter((c) => c.q.includes(st.tq));
    const total = r.length;
    r = sortRows(r, st.tsort).slice(0, 500);
    $('#oe-tcount').textContent = `${total} complexes${total > 500 ? ' (first 500 shown; search to narrow)' : ''}. Net ha: area outside counted protected areas; + points: of % of the land or sea area.`;
    const tb = $('#oe-table tbody');
    tb.replaceChildren(...r.map((c) => {
      const tr = el('tr', 'pick' + (c.cid === st.sel ? ' oe-cur' : '')); tr.tabIndex = 0; tr.dataset.cid = c.cid;
      const go = () => select(c.cid, { scroll: true });
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const td = (v, cls) => { const x = el('td', cls); if (v instanceof Node) x.append(v); else x.textContent = v == null ? '' : String(v); return x; };
      const nm = el('span'); nm.append(el('b', null, c.name)); if (c.n_members > 1) nm.append(el('span', 'oe-meas', ` · ${c.n_members} records`));
      tr.append(td(c.rank, 'n'), td(tierBadge(c.tier)), td(nm), td(el('span', 'oe-meas', c.measures.join('; '))), td(c.governorate), td(f1(c.net_ha), 'n'),
        td(`+${fPp(c.pp)} ${c.realm}`, 'n'), td(c.kba_ha ? f1(c.kba_ha) : '–', 'n'), td(el('span', 'oe-meas', c.kba_names.slice(0, 2).join('; ') + (c.kba_names.length > 2 ? '…' : ''))),
        td(c.natural == null ? '–' : fPct(c.natural * 100, 0), 'n'), td(c.score == null ? '–' : f2(c.score), 'n'));
      return tr;
    }));
    $$('#oe-table th').forEach((th) => { const b = th.querySelector('button'); th.setAttribute('aria-sort', b && b.dataset.k === st.tsort[0] ? (st.tsort[1] > 0 ? 'ascending' : 'descending') : 'none'); });
    // KBA table
    const KF = { gap: (k) => k.gap_km2 >= 0.01, reached: (k) => k.gap_km2 >= 0.01 && k.p12_km2 > 0.005, none: (k) => k.gap_km2 >= 0.01 && k.all_km2 <= 0.005, all: () => true };
    const kr = sortRows(D.kbas.filter(KF[st.kfilter]), st.ksort);
    $('#oe-kcount').textContent = `${kr.length} KBAs. Gap: KBA area outside counted protected areas. P1 / P1+P2 / All: how much of the gap the candidates would cover (overlaps removed).`;
    $('#oe-kbatable tbody').replaceChildren(...kr.map((k) => {
      const tr = el('tr', 'pick'); tr.tabIndex = 0;
      const go = () => { kbaCard(k); $('#card-oe-map').scrollIntoView({ behavior: 'smooth' }); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const td = (v, cls) => el('td', cls, v == null ? '' : String(v));
      tr.append(td(k.kba), td(k.kba_class), td(f1(k.area_km2), 'n'), td(fPct(k.covered_pct), 'n'), td(f1(k.gap_km2), 'n'), td(f1(k.p1_km2), 'n'), td(f1(k.p12_km2), 'n'),
        td(f1(k.all_km2), 'n'), td(fPct(k.p12_cov_pct), 'n'), td(k.n_threatened, 'n'), td(k.verdict));
      return tr;
    }));
  };

  const drawKbaChart = () => {
    const box = $('#oe-kbachart'), w = Math.max(300, box.clientWidth);
    const KF = { gap: (k) => k.gap_km2 >= 0.01, reached: (k) => k.gap_km2 >= 0.01 && k.p12_km2 > 0.005, none: (k) => k.gap_km2 >= 0.01 && k.all_km2 <= 0.005, all: () => true };
    chips($('#oe-kba-chips'), [['gap', 'KBAs with a gap'], ['reached', 'Reached by P1 + P2'], ['none', 'Reached by no candidate'], ['all', 'All KBAs']],
      (v) => v === st.kfilter, (v) => { st.kfilter = v; drawKbaChart(); renderTables(); });
    const ks = D.kbas.filter(KF[st.kfilter]).sort((a, b) => b.gap_km2 - a.gap_km2).slice(0, 30);
    const labelW = Math.min(230, w * 0.38), rowH = 22, h = ks.length * rowH + 26;
    box.querySelectorAll('svg').forEach((x) => x.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const x = d3.scaleLinear([0, 100], [labelW, w - 46]);
    svg.append('g').attr('transform', `translate(0,${h - 20})`).call(d3.axisBottom(x).ticks(5).tickFormat((d) => d + '%'))
      .call((g) => g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)')).call((g) => g.selectAll('.domain,.tick line').attr('stroke', 'var(--cds-chart-axis)'));
    svg.append('line').attr('x1', x(30)).attr('x2', x(30)).attr('y1', 0).attr('y2', h - 20).attr('stroke', 'var(--wwf-black)').attr('stroke-dasharray', '4 3');
    const tip = tipIn(box);
    ks.forEach((k, i) => {
      const y = i * rowH + 2, A = k.area_km2 || 1;
      const parts = [['Covered today', k.covered_pct, 'var(--wwf-green)'], ['+ Priority 1', k.p1_km2 / A * 100, TIER_C.P1], ['+ Priority 2', (k.p12_km2 - k.p1_km2) / A * 100, TIER_C.P2],
        ['+ Priority 3', (k.all_km2 - k.p12_km2) / A * 100, TIER_C.P3]];
      const used = parts.reduce((s2, p) => s2 + Math.max(0, p[1]), 0);
      parts.push(['No candidate', Math.max(0, 100 - used), 'var(--wwf-berry)']);
      const name = k.kba.length > 34 ? k.kba.slice(0, 33) + '…' : k.kba;
      svg.append('text').attr('x', labelW - 6).attr('y', y + 13).attr('text-anchor', 'end').style('font-size', '11.5px').text(name);
      let x0 = 0;
      parts.forEach(([l, v, col]) => { if (v <= 0.01) return; const vv = Math.min(v, 100 - x0);
        svg.append('rect').attr('x', x(x0)).attr('y', y + 3).attr('width', Math.max(1, x(x0 + vv) - x(x0))).attr('height', rowH - 7).attr('fill', col).attr('fill-opacity', l === 'No candidate' ? 0.25 : 1);
        x0 += vv; });
      svg.append('text').attr('x', w - 42).attr('y', y + 13).style('font-size', '11px').attr('fill', 'var(--color-fg-muted)').text(`${f0(k.gap_km2)} km²`);
      svg.append('rect').attr('x', 0).attr('y', y).attr('width', w).attr('height', rowH).attr('fill', 'transparent').style('cursor', 'pointer')
        .on('mousemove', (ev) => tip.show(ev, [k.kba, `${k.kba_class} · ${f1(k.area_km2)} km² · covered ${fPct(k.covered_pct)}`, `Gap ${f1(k.gap_km2)} km²: P1 ${f1(k.p1_km2)}, P1+P2 ${f1(k.p12_km2)}, all ${f1(k.all_km2)} km²`, k.verdict]))
        .on('mouseleave', () => tip.hide()).on('click', () => { tip.hide(); kbaCard(k); $('#card-oe-map').scrollIntoView({ behavior: 'smooth' }); });
    });
    const it = (c, o, t) => { const sp = el('span'), i = el('i'); i.style.background = c; i.style.opacity = o; sp.append(i, t); return sp; };
    $('#oe-kba-legend').replaceChildren(it('var(--wwf-green)', 1, 'Covered today'), it(TIER_C.P1, 1, '+ Priority 1 / reporting'), it(TIER_C.P2, 1, '+ Priority 2'), it(TIER_C.P3, 1, '+ Priority 3'),
      it('var(--wwf-berry)', 0.3, 'Reached by no candidate'), el('span', null, 'Right: gap in km². Click a bar to see the KBA on the map.'));
  };

  const drawCats = () => {
    const s = D.summ;
    $('#oe-cats').replaceChildren(...s.by_category.sort((a, b) => (b.n_P1 + b.n_REPORT + b.n_P2) - (a.n_P1 + a.n_REPORT + a.n_P2) || b.n_complexes - a.n_complexes).map((c) => {
      const d = el('div', 'oe-cat'); d.style.setProperty('--c', CAT[c.category]?.[1] || 'var(--wwf-black)');
      d.append(el('h3', null, c.label));
      d.append(el('div', 'n', `${d3.format(',')(c.n_candidates)} mapped sites → ${d3.format(',')(c.n_complexes)} complexes`));
      const bar = el('div', 'bar'), tot = TIERS.reduce((s2, t) => s2 + (c['n_' + t] || 0), 0) || 1;
      TIERS.forEach((t) => { const v = c['n_' + t] || 0; if (!v) return; const i = el('i'); i.style.width = v / tot * 100 + '%'; i.style.background = TIER_C[t]; i.title = `${TIER_SHORT[t]}: ${v}`; bar.append(i); });
      d.append(bar, el('div', 'n', TIERS.filter((t) => c['n_' + t]).map((t) => `${TIER_SHORT[t]} ${c['n_' + t]}`).join(' · ')));
      s.measures.filter((m) => m.category === c.category).forEach((m) => {
        const p = el('p'); p.append(el('b', null, `${m.label}. `), `${m.measure} `);
        p.append(el('span', 'oe-note', `Strength ${m.strength}, permanence ${m.permanence}, mapping confidence ${m.confidence}${m.max_tier ? `; priority ${m.max_tier.slice(1)} at most` : ''}. Main risk: ${m.risks}`));
        d.append(p);
      });
      return d;
    }));
  };

  const drawGov = () => {
    const box = $('#oe-gov'), w = Math.max(280, box.clientWidth), gs = D.summ.by_governorate.slice(0, 18);
    const labelW = 110, rowH = 22, h = gs.length * rowH + 24, max = d3.max(gs, (g) => g.n_p1 + g.n_p2) || 1;
    box.querySelectorAll('svg').forEach((x) => x.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const x = d3.scaleLinear([0, max], [labelW, w - 60]);
    const tip = tipIn(box);
    gs.forEach((g, i) => {
      const y = i * rowH;
      svg.append('text').attr('x', labelW - 6).attr('y', y + 14).attr('text-anchor', 'end').style('font-size', '12px').text(g.governorate);
      svg.append('rect').attr('x', x(0)).attr('y', y + 4).attr('width', x(g.n_p1) - x(0)).attr('height', rowH - 8).attr('fill', TIER_C.P1);
      svg.append('rect').attr('x', x(g.n_p1)).attr('y', y + 4).attr('width', x(g.n_p1 + g.n_p2) - x(g.n_p1)).attr('height', rowH - 8).attr('fill', TIER_C.P2);
      svg.append('text').attr('x', x(g.n_p1 + g.n_p2) + 5).attr('y', y + 14).style('font-size', '11px').attr('fill', 'var(--color-fg-muted)').text(`${g.n_p1} + ${g.n_p2}`);
      svg.append('rect').attr('x', 0).attr('y', y).attr('width', w).attr('height', rowH).attr('fill', 'transparent').style('cursor', 'pointer')
        .on('mousemove', (ev) => tip.show(ev, [g.governorate, `Priority 1 (incl. reporting): ${g.n_p1} · Priority 2: ${g.n_p2}`, `${fHa(g.net_ha)} outside PAs, ${fHa(g.kba_ha)} in KBAs`, 'Click to list them']))
        .on('mouseleave', () => tip.hide()).on('click', () => { tip.hide(); st.tq = g.governorate.toLowerCase(); $('#oe-tsearch').value = g.governorate; st.ttier = 'P12'; renderTables(); $('#card-oe-table').scrollIntoView({ behavior: 'smooth' }); });
    });
    svg.append('text').attr('x', labelW).attr('y', h - 4).style('font-size', '11px').attr('fill', 'var(--color-fg-muted)').text('orange: priority 1 / reporting · yellow: priority 2');
  };

  const drawMethod = () => {
    const s = D.summ, sc = s.scoring, w = sc.weights;
    const box = $('#oe-method');
    const p = (t) => el('p', null, t);
    const ol = el('ol');
    [
      `Candidates. The OECM Harvester gathers sites by category from open sources and legal texts (${s.n_candidates.toLocaleString()} sites with a mapped boundary for ${s.country}; the harvester's point-only records are not used). Each polygon is assigned to a measure type (e.g. "Water Code protection zone", "hunting reserve listed every season").`,
      'Net area. Each site is cut to the realm its measure applies to (sea for fisheries, land for the rest), then the protected areas and OECMs already counted in indicator 3.1 are removed (full-resolution flattened layer, Mollweide equal-area projection, the same as the indicator).',
      'Evidence per site: overlap of the net area with each KBA and with the KBA part not covered today; land cover of the net area from ESA WorldCover 2021 (10 m); the ecoregion and how well it is covered today; distance to the nearest counted protected area; the governorate; other candidates stacked on the same ground.',
      'Site complexes. Records of the same place are grouped and assessed together: a reservoir and its Water Code belts; the hunting reserve on a dam; fragments of one named oasis; any two candidates overlapping by at least 25% that are of comparable size. Very large containers (whole imadas, the border zone) are not merged with the sites inside them; they are listed as "it also lies inside".',
      `Score (0 to 1) = ${w.measure} × Measure + ${w.biodiversity} × Biodiversity + ${w.size} × Size, plus ${sc.stack_bonus} for each additional category stacked on the same ground (2 at most).`,
      `Measure = ${sc.measure.strength} × strength + ${sc.measure.permanence} × permanence + ${sc.measure.confidence} × mapping confidence. These are expert judgements per measure type (table below); confidence goes up 0.1 for a legal reference or heritage designation and down 0.1 for an unnamed or approximately located site.`,
      `Biodiversity = ${sc.biodiversity.kba} × KBA + ${sc.biodiversity.habitat} × habitat + ${sc.biodiversity.representation} × representation + ${sc.biodiversity.connectivity} × connectivity. KBA: share of the net area in KBAs (full at ${sc.kba_share_full * 100}%), × ${sc.kba_no_threatened} if no KBA has a threatened trigger species, and multiplied by the habitat term (at least ${sc.kba_habitat_floor}), because KBA outlines often include villages and farmland. Habitat: natural share of WorldCover classes (tree, shrub, grass, wetland, water count fully; bare 0.6; cropland 0.15; built-up 0), or a prior for marine sites and oases. Representation: 1 − ecoregion coverage / 30%. Connectivity: 1 within 1 km of a counted PA, 0.5 within 5 km.`,
      `Size = log10(1 + net ha) / log10(1 + ${d3.format(',')(sc.size_full_ha)}).`,
      `Priority. Priority 1 from ${sc.tiers.P1}, priority 2 from ${sc.tiers.P2}, else priority 3, with these rules: at least ${sc.p1_min_ha} ha and medium mapping confidence for priority 1, at least ${sc.p2_min_ha} ha for priority 2; temporary measures (permanence below ${sc.long_term_min}) are priority 3; some measure types are capped (table). Sites at least ${sc.already_covered_pct}% inside counted PAs are "already covered"; sites adding less than ${sc.min_net_ha} ha are "too small". Marine park zones missing from the WDPA are flagged as "reporting gaps": they are protected areas to report, not OECMs.`,
      'Argument. For each complex the page writes the case against the four CBD criteria. A: not a protected area. B: governed and managed (legal basis, authority). C: sustained in-situ outcomes (KBAs, trigger species, habitat, permanence). D: other values. It adds the reasons for and against, the risks, the evidence to collect and the next step.',
      'Totals. What each priority adds to the indicator and to each KBA is computed on the union of the complexes, so overlaps are counted once.',
    ].forEach((t) => ol.append(el('li', null, t)));
    const t = el('table', 'oe-mt'), th = el('thead'), tr = el('tr');
    ['Measure type', 'Category', 'Strength', 'Permanence', 'Confidence', 'Cap', 'Authority'].forEach((x) => tr.append(el('th', null, x))); th.append(tr); t.append(th);
    const tb = el('tbody');
    s.measures.forEach((m) => { const r = el('tr'); [m.label, CAT[m.category]?.[0] || m.category, m.strength, m.permanence, m.confidence, m.max_tier ? `P${m.max_tier.slice(1)}` : '', m.authority].forEach((v) => r.append(el('td', null, String(v)))); tb.append(r); });
    t.append(tb);
    const tbx = el('div', 'mt-tablebox'); tbx.append(t);
    const lim = el('ul');
    ['Candidate extents come from open data of uneven quality (OpenStreetMap outlines, reservoir extents, rebuilt legal zones, tree-cover detections): see each category\'s metadata in the OECM Harvester outputs.',
      'KBA overlap shows potential, not presence: whether the trigger species use the site has to be checked.',
      'WorldCover is a 2021 snapshot at 10 m; small sites and narrow belts are approximate.',
      'The scores are a provisional rubric to rank and discuss candidates. They are not an OECM assessment: recognition needs the governing authority\'s consent and evidence of sustained biodiversity outcomes (IUCN-WCPA 2019 guidance; site-level assessment tool).',
      'Only the categories harvested so far are screened. State forests under management plans, rangeland reserves, private and community-conserved areas are not yet mapped and may be the larger land opportunity.']
      .forEach((x) => lim.append(el('li', null, x)));
    const files = el('ul');
    [['downloads/oecm_complexes.csv', 'Site complexes: evidence, score, priority, criteria status, next steps'], ['downloads/oecm_candidates.csv', 'Every candidate record with its complex and score'],
      ['downloads/oecm_kbas.csv', 'KBAs: gap today and what each priority would fill'], ['downloads/oecm_complexes.gpkg', 'Complex outlines (net of counted PAs, WGS 84) for GIS'],
      ['downloads/Tunisia_OECM_opportunities.pdf', 'The report: OECMs in Tunisia, where to start (discussion draft, 43 pages)']]
      .forEach(([href, txt]) => { const li = el('li'); const a = el('a', null, href.split('/')[1]); a.href = href; a.download = ''; li.append(a, ` — ${txt}`); files.append(li); });
    box.replaceChildren(ol, el('h3', null, 'Measure types (expert judgements, set in 06_oecm/scripts/oecm_measures.yaml)'), tbx,
      el('h3', null, 'Limits'), lim, el('h3', null, 'Downloads'), files, p(s.note));
  };

  // ------------------------------------------------------------------ controls
  const drawLayerChips = () => {
    chips($('#oe-layer-chips'), [['kba', 'KBA outlines'], ['gap', 'KBA gaps'], ['pa', 'Counted PAs'], ['dots', 'Priority markers']],
      (v) => st.layers.has(v), (v) => { st.layers.has(v) ? st.layers.delete(v) : st.layers.add(v); drawLayerChips(); applyFilters(); });
  };
  const drawControls = () => {
    const iso = D.iso;
    const n = (ts) => D.cx.filter((c) => ts.includes(c.tier)).length;
    chips($('#oe-tier-chips'), [['P1', `Priority 1 only (${n(VIEWS.P1)})`, TIER_C.P1], ['P12', `Priority 1 + 2 (${n(VIEWS.P12)})`, TIER_C.P2],
      ['P123', `All priorities (${n(VIEWS.P123)})`, TIER_C.P3], ['all', 'Everything mapped', TIER_C.COVERED]], (v) => v === st.view, (v) => setView(v, true));
    chips($('#oe-cat-chips'), [['all', 'All categories'], ...Object.entries(CAT).map(([k, [l, c]]) => [k, l, c])], (v) => v === st.cat, (v) => setCat(v, true));
    const pl = $('#oe-p1list');
    if (pl && pl.dataset.iso !== iso) {
      pl.dataset.iso = iso;
      pl.replaceChildren(el('span', 'oe-p1l', 'Priority 1 and reporting gaps:'), ...D.cx.filter((c) => c.tier === 'P1' || c.tier === 'REPORT').sort((a, b) => a.rank - b.rank).map((c) => {
        const b = el('button', 'na-chip'); b.type = 'button'; b.dataset.cid = c.cid;
        const num = el('b', 'oe-p1n', String(c.rank)); num.style.background = TIER_C[c.tier];
        b.append(num, c.name.length > 42 ? c.name.slice(0, 40) + '…' : c.name); b.title = c.headline;
        b.addEventListener('click', () => select(c.cid, {})); return b;
      }));
    }
    drawLayerChips();
    const dl = $('#oe-find-list');
    if (dl.dataset.iso !== iso) {
      dl.dataset.iso = iso;
      dl.replaceChildren(...D.cx.filter((c) => TIER_O[c.tier] <= 3).map((c) => Object.assign(el('option'), { value: `${c.name} · #${c.rank}` })),
        ...D.kbas.map((k) => Object.assign(el('option'), { value: `KBA · ${k.kba}` })));
    }
  };
  // view = which priorities are drawn; changing it re-centres the map on what is shown
  const closeCardIfHidden = () => {
    const c = st.sel && D.byCid[st.sel], card = $('#oe-map .map-card');
    if (card && c && !(st.tiers.has(c.tier) && c.categories.some((x) => st.cats.has(x)))) card.hidden = true;
  };
  const setView = (v, fit) => {
    st.view = v; st.tiers = new Set(VIEWS[v]); st.pin = null; closeCardIfHidden(); drawControls(); applyFilters();
    if (fit && main) fitShown();
  };
  const setCat = (v, fit) => {
    st.cat = v; st.cats = new Set(v === 'all' ? Object.keys(CAT) : [v]); st.pin = null; closeCardIfHidden(); drawControls(); applyFilters();
    if (fit && main) fitShown();
  };
  const fitShown = () => {
    const pts = D.cx.filter((c) => st.tiers.has(c.tier) && c.categories.some((x) => st.cats.has(x)) && D.ctr[c.cid]).map((c) => D.ctr[c.cid]);
    if (!pts.length) { fitMain(main.land.node()); return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const b = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    const land = main.land.node().getBBox();
    if (b.width > land.width * 0.6 || b.height > land.height * 0.6) { fitMain(main.land.node()); return; }
    const pad = Math.max(b.width, b.height) * 0.15 + 5;
    fitBox(main, { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad }, 0.9, 400);
  };
  const bindOnce = () => {
    if (bindOnce.done) return; bindOnce.done = true;
    $('#oe-find').addEventListener('change', (e) => {
      const v = e.target.value.trim();
      const m = v.match(/#(\d+)$/);
      if (m) { const c = D.cx.find((x) => x.rank === +m[1]); if (c) { select(c.cid, {}); renderTables(); } }
      else if (v.startsWith('KBA · ')) { const k = D.kbas.find((x) => x.kba === v.slice(6)); if (k) kbaCard(k); }
      else { const q = v.toLowerCase(); const c = D.cx.find((x) => x.name.toLowerCase().includes(q) && TIER_O[x.tier] <= 3); if (c) select(c.cid, {}); }
    });
    $('#oe-tsearch').addEventListener('input', (e) => { st.tq = e.target.value.trim().toLowerCase(); renderTables(); });
    $$('#oe-map .oe-zoom button').forEach((b) => b.addEventListener('click', () => {
      if (!main) return;
      if (b.dataset.z === 'reset') fitMain(main.land.node()); else main.svg.transition().duration(300).call(main.zoom.scaleBy, b.dataset.z === 'in' ? 2 : 0.5);
    }));
    sortHead('#oe-table', 'tsort'); sortHead('#oe-kbatable', 'ksort');
  };

  // ------------------------------------------------------------------ entry point (called by app.js)
  window.oecmDraw = (geo) => {
    const need = ['oecm_summary', 'oecm_complexes', 'oecm_shapes', 'oecm_kbas', 'oecm_pas'];
    if (!need.every((id) => dash.data(id).status === 'ok') || !geo) return;
    geoAll = geo;
    const iso = dash.params().iso || 'TUN';
    const have = new Set(rows('oecm_summary').map((r) => r.iso3));
    const countries = rows('countries') || [];
    chips($('#oe-country-chips'), ['TUN', 'DZA', 'MAR', 'LBY', 'EGY'].map((i) => [i, (countries.find((c) => c.iso3 === i)?.country || i) + (have.has(i) ? '' : ' (not screened yet)')]),
      (v) => v === iso, (v) => dash.setParams({ iso: v }));
    $('#oe-body').hidden = !have.has(iso); $('#oe-empty').hidden = have.has(iso);
    if (!have.has(iso)) return;
    if (!D || D.iso !== iso) { D = prepare(iso); main = null; st.sel = null; }
    bindOnce();
    const w = $('#oe-map').clientWidth;
    const sig = `${iso}|${w}`;
    drawControls();
    const rebuilt = buildMain(geo);
    if (st.built !== sig || rebuilt) {
      st.built = sig;
      drawHead(); drawBars(); drawFunnel(); drawLegend(); drawKbaChart(); drawCats(); drawGov(); drawMethod(); renderTables();
      const fromHash = (location.hash.match(/^#oecm\/(C\d+)/) || [])[1];
      const cid = st.sel || (fromHash && D.byCid[fromHash] ? fromHash : D.order[0]);
      if (cid) { st.sel = cid; highlight(); renderProfile(D.byCid[cid]); $$('#oe-table tbody tr').forEach((tr) => tr.classList.toggle('oe-cur', tr.dataset.cid === cid)); }
      if (fromHash && fromHash === cid) setTimeout(() => $('#oe-profile').scrollIntoView(), 50);
    }
  };
})();
