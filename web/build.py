"""Build the single-file web app (docs/index.html) for GitHub Pages.

The page is fully self-contained: it works offline and does not depend on Google Fonts or any CDN.
  template.html      page structure, styles and interface code
  core.js            statistics shared with the Node tests
  vendor/            Chart.js (MIT) and SheetJS "mini" build (Apache-2.0)
  fonts/             Plus Jakarta Sans variable font subsets (SIL OFL 1.1)
  art/               page illustrations (Servier Medical Art, DBCLS via Bioicons; see art/README.md)
"""
import base64, json
from pathlib import Path

here = Path(__file__).parent
read = lambda p: (here / p).read_text(encoding="utf-8")

# unicode-range of each font subset (latin, latin-ext, vietnamese)
RANGES = json.loads(read("fonts/ranges.json"))
faces = []
for name in ("vietnamese", "latin-ext", "latin"):
    data = base64.b64encode((here / "fonts" / f"plus-jakarta-sans-{name}-wght-normal.woff2").read_bytes()).decode()
    faces.append("@font-face{font-family:'Plus Jakarta Sans Variable';font-style:normal;font-display:swap;font-weight:200 800;"
                 f"src:url(data:font/woff2;base64,{data}) format('woff2');unicode-range:{RANGES[name]}}}")

safe = lambda js: js.replace("</script", "<\\/script")
vendor = "".join(f"<script>\n{safe(read(f'vendor/{n}'))}\n</script>\n" for n in ("chart.umd.js", "xlsx.mini.min.js"))

ART = {"analyzer": "hba1c-analyzer.svg", "rack": "tube-rack.svg", "blood": "blood-sampling.svg", "cabinet": "safety-cabinet.svg", "pipette": "pipetting.svg", "scope": "microscope.svg"}
art_css = "\n".join(f'.art-{k}{{background-image:url("data:image/svg+xml;base64,{base64.b64encode((here / "art" / v).read_bytes()).decode()}")}}' for k, v in ART.items())

html = (read("template.html")
        .replace("/*FONTS*/", "\n".join(faces))
        .replace("/*ART*/", art_css)
        .replace("<!--VENDOR-->", vendor)
        .replace("/*CORE*/", safe(read("core.js"))))
out = here.parent / "docs" / "index.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({len(html) // 1024} KB)")
