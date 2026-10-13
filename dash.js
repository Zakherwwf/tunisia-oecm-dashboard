/* Minimal stand-in for the dashboard runtime: loads the JSON datasets, runs calculations,
   keeps filter state and redraws on data, filter and width changes. */
(() => {
  const IDS = ['countries', 'timeseries', 'sites', 'kbas', 'ecoregions', 'wetlands', 'governance', 'effectiveness', 'narratives', 'geo', 'sitesgeo',
    'oecm_summary', 'oecm_complexes', 'oecm_shapes', 'oecm_kbas', 'oecm_pas'];
  const DEFAULTS = { iso: 'TUN', metric: 'land_pct', realm: 'Land', kbagroup: 'all', sitefilter: 'all', layers: ['pa', 'oecm', 'kba', 'sea'] };
  const store = {}, calcs = {}, subs = [];
  let params = { ...DEFAULTS };
  IDS.forEach((id) => (store[id] = { status: 'loading', data: [] }));
  const notify = () => subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const runCalcs = () => Object.entries(calcs).forEach(([id, c]) => {
    if (c.inputs.every((i) => (store[i] || calcs[i]?.res)?.status === 'ok')) {
      try { c.res = { status: 'ok', data: c.fn(...c.inputs.map((i) => (store[i] || calcs[i].res).data)) }; }
      catch (e) { c.res = { status: 'error', data: [], message: String(e) }; }
    } else c.res = { status: 'loading', data: [] };
  });
  window.dash = {
    colors: ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'],
    data: (id) => (store[id] || calcs[id]?.res || { status: 'missing', data: [] }),
    onData: (fn) => { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc: (id, { inputs, fn }) => { calcs[id] = { inputs, fn }; runCalcs(); },
    loader: () => {},
    params: () => ({ ...params }),
    setParams: (o) => { params = { ...params, ...o }; notify(); },
    resetParams: () => { params = { ...DEFAULTS }; notify(); },
    setLink: (name) => { try { history.replaceState(null, '', '#' + name); } catch (e) {} },
    refresh: () => {},
  };
  IDS.forEach((id) => fetch(`data/${id}.json`, { cache: 'no-cache' }).then((r) => r.json()).then((rows) => { store[id] = { status: 'ok', data: rows }; runCalcs(); notify(); })
    .catch((e) => { store[id] = { status: 'error', data: [], message: String(e) }; notify(); }));
  let w = window.innerWidth, t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (window.innerWidth !== w) { w = window.innerWidth; notify(); } }, 150); });
})();
