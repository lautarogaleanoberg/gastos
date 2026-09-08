#!/usr/bin/env python3
"""Genera gastos-standalone.html: un único archivo con el CSS y el JS incrustados.
Úsalo para compartir la app como un solo fichero (se abre con doble clic).

    python3 build-standalone.py
"""
import pathlib
import re

here = pathlib.Path(__file__).parent
html = (here / "index.html").read_text(encoding="utf-8")
css = (here / "styles.css").read_text(encoding="utf-8")
js = (here / "app.js").read_text(encoding="utf-8")

html = html.replace(
    '<link rel="stylesheet" href="styles.css" />',
    "<style>\n" + css + "\n</style>",
)
html = html.replace(
    '<script src="app.js"></script>',
    "<script>\n" + js + "\n</script>",
)

out = here / "gastos-standalone.html"
out.write_text(html, encoding="utf-8")
print(f"escrito {out} ({out.stat().st_size / 1024:.1f} KB)")
