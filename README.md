# Tunisia OECM opportunities (dashboard)

Static dashboard: which sites in Tunisia could become **OECMs** (other effective area-based conservation measures, CBD Decision 14/8),
what they would add to GBF Headline Indicator 3.1, and which Key Biodiversity Areas they would cover.

It opens on the **OECM opportunities** page:
- the figures and the recommendations;
- what each priority would add;
- a map of every candidate site, with filters by priority and category;
- a two-part profile for each site complex: its description, then its assessment against the four OECM criteria;
- the priority list and the KBA gaps;
- category, governorate and method sections;
- downloads: CSV and GeoPackage files, and the PDF report.

Two more tabs give context: **Tunisia today** (indicator 3.1) and **North Africa** (the regional comparison).

- Data: `data/oecm_*.json`, built from the `06_oecm` analysis of the North Africa 30×30 project (OECM Harvester candidates,
  WDPA/WD-OECM October 2026, World Database of KBAs September 2026, ESA WorldCover 2021).
- Run locally: `python3 -m http.server`, then open http://localhost:8000.
- Hosting: Vercel (static, no build step).

Screening for discussion, not an OECM assessment. KBA content © KBA Partnership (World Database of KBAs terms of use);
WDPA content: UNEP-WCMC terms. The WWF logo and font belong to WWF.
