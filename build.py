"""
Сборка страниц ARTCAMINHO.

Исходники лежат в src/: страницы в src/pages, общие блоки в src/partials.
Запуск:  python build.py   → готовые .html появляются в корне проекта.

В странице можно использовать:
  {{partial-name}}       — вставить src/partials/partial-name.html
  {{partial-name*6}}     — вставить блок 6 раз подряд
Первая строка страницы — настройки:
  <!-- title: Курсы | active: courses | layout: page -->
  layout: page (шапка с логотипом) или home (шапка внутри первого экрана)
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
ICONS = ROOT / "assets" / "icons"

# Иконки, которых нет в макете как отдельных компонентов
EXTRA_SYMBOLS = {
    "heart-fill": ('0 0 24 24', '<path d="M12 20.3l-1.2-1.1C6 14.9 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.6 0 3.1.7 4.2 1.9C13.1 4.7 14.6 4 16.2 4 18.9 4 21 6.1 21 8.8c0 3.4-3 6.1-7.8 10.4L12 20.3z" fill="currentColor"/>'),
    "arrow-left": ('0 0 14 10', '<path d="M13 5H1m4-4L1 5l4 4" stroke="currentColor" stroke-width="1.2" fill="none"/>'),
    "arrow-right": ('0 0 14 10', '<path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" stroke-width="1.2" fill="none"/>'),
    "arrow-left-sm": ('0 0 8 4', '<path d="M8 2H.6M2.2.3.5 2l1.7 1.7" stroke="currentColor" stroke-width=".8" fill="none"/>'),
    "arrow-right-sm": ('0 0 8 4', '<path d="M0 2h7.4M5.8.3 7.5 2 5.8 3.7" stroke="currentColor" stroke-width=".8" fill="none"/>'),
    "burger": ('0 0 24 24', '<path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1.5" fill="none"/>'),
    "phone": ('0 0 24 24', '<path d="M6.6 3.5h2.6l1.4 4-1.9 1.3a11 11 0 0 0 6.5 6.5l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>'),
}
VIEWBOX_FIX = {"close": "-1 -1 17 17"}


def build_sprite():
    symbols = []
    for svg in sorted(ICONS.glob("*.svg")):
        text = svg.read_text(encoding="utf-8")
        vb = re.search(r'viewBox="([^"]+)"', text).group(1)
        vb = VIEWBOX_FIX.get(svg.stem, vb)
        inner = re.sub(r"^<svg[^>]*>|</svg>\s*$", "", text.strip())
        symbols.append(f'<symbol id="i-{svg.stem}" viewBox="{vb}">{inner}</symbol>')
    for name, (vb, inner) in EXTRA_SYMBOLS.items():
        symbols.append(f'<symbol id="i-{name}" viewBox="{vb}">{inner}</symbol>')
    return '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' + "".join(symbols) + "</svg>"


def load_partials():
    return {p.stem: p.read_text(encoding="utf-8") for p in (SRC / "partials").glob("*.html")}


def expand(text, partials, depth=0):
    def repl(m):
        name, times = m.group(1), int(m.group(2) or 1)
        if name not in partials:
            return m.group(0)
        return expand(partials[name], partials, depth + 1) * times
    if depth > 5:
        return text
    return re.sub(r"\{\{([a-z0-9-]+)(?:\*(\d+))?\}\}", repl, text)


def main():
    partials = load_partials()
    partials["sprite"] = build_sprite()
    for page in sorted((SRC / "pages").glob("*.html")):
        raw = page.read_text(encoding="utf-8")
        first, body = raw.split("\n", 1)
        meta = dict(
            (k.strip(), v.strip())
            for k, v in (part.split(":", 1) for part in first.strip("<!-> \r").split("|"))
        )
        layout = partials["layout-" + meta.get("layout", "page")]
        html = expand(layout.replace("{{content}}", body), partials)
        html = html.replace("{{title}}", meta.get("title", "ARTCAMINHO"))
        html = html.replace("{{description}}", meta.get("description", "ARTCAMINHO — художественные материалы, мозаика, курсы и мастер-классы."))
        active = meta.get("active", "")
        if active:
            html = html.replace(f'data-nav="{active}" class="nav__link"', f'data-nav="{active}" class="nav__link is-active" aria-current="page"')
        (ROOT / page.name).write_text(html, encoding="utf-8")
        print("ok", page.name)


if __name__ == "__main__":
    main()
