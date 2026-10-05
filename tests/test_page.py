import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.section_ids = []
        self.sections = {}
        self._section_depth = 0
        self._current_section = None
        self._card = None
        self._in_strong = False
        self._strong_parts = []
        self._row = None
        self._cell = None
        self._cell_parts = []
        self._row_is_header = False
        self.ids = []
        self.anchors = []
        self.images = []
        self.image_details = []
        self.pages = {}
        self._current_page = None
        self.announced = []
        self.nav_links = []
        self.nav_texts = []
        self._link_parts = None
        self._link_class = None
        self._nav_stack = []
        self._in_title = False
        self.title = ""
        self.meta_description = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "nav" and "class" in attrs:
            self._nav_stack.append(attrs["class"])
        if tag == "a" and attrs.get("href", "").startswith("#"):
            self.anchors.append(attrs["href"][1:])
            if self._nav_stack:
                self.nav_links.append((self._nav_stack[-1], attrs["href"]))
                self._link_class = self._nav_stack[-1]
                self._link_parts = []
        if tag == "div" and "page" in classes and self._current_section:
            self.pages.setdefault(self._current_section, []).append(attrs.get("id"))
            self._current_page = attrs.get("id")
        if tag == "img":
            self.image_details.append(
                {
                    "src": attrs.get("src", ""),
                    "alt": attrs.get("alt"),
                    "section": self._current_section,
                    "page": self._current_page,
                }
            )
            if "src" in attrs:
                self.images.append(attrs["src"])
                if self._card is not None:
                    self._card["logo"] = attrs["src"]
            if attrs.get("alt"):
                self.announced.append(attrs["alt"])
        if attrs.get("aria-label"):
            self.announced.append(attrs["aria-label"])
        if tag == "li" and "drum-card" in classes:
            self._card = {"name": None, "logo": None}
        if tag == "strong" and self._card is not None:
            self._in_strong = True
            self._strong_parts = []
        if tag == "section" and "chapter" in classes:
            self.section_ids.append(attrs.get("id"))
            self._section_depth += 1
            self._current_section = attrs.get("id")
            self.sections[self._current_section] = {
                "wallet_cards": [],
                "claims": [],
                "table_rows": [],
                "chapter_index": None,
                "text": "",
            }
        if "claim" in classes and self._current_section:
            self.sections[self._current_section]["claims"].append("")
        if "chapter-index" in classes and self._current_section:
            self._in_chapter_index = True
            self._chapter_index_parts = []
        if tag == "tr":
            self._row = []
            self._row_is_header = False
        if tag in ("td", "th"):
            self._cell = []
            if tag == "th":
                self._row_is_header = True
        if tag == "meta" and attrs.get("name") == "description":
            self.meta_description = attrs.get("content", "")
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "section" and self._section_depth:
            self._section_depth -= 1
            self._current_section = None
            self._current_page = None
        if tag == "nav" and self._nav_stack:
            self._nav_stack.pop()
        if tag == "a" and self._link_parts is not None:
            text = " ".join("".join(self._link_parts).split())
            self.nav_texts.append((self._link_class, text))
            self._link_parts = None
            self._link_class = None
        if tag == "strong" and self._in_strong:
            self._in_strong = False
            if self._card is not None:
                self._card["name"] = "".join(self._strong_parts).strip()
        if tag == "li" and self._card is not None:
            if self._current_section:
                self.sections[self._current_section]["wallet_cards"].append(
                    self._card
                )
            self._card = None
        if tag == "p" and getattr(self, "_in_chapter_index", False):
            self._in_chapter_index = False
            if self._current_section:
                digits = "".join(
                    c for c in "".join(self._chapter_index_parts) if c.isdigit()
                )
                self.sections[self._current_section]["chapter_index"] = digits or None
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        if tag == "tr" and self._row is not None:
            if self._row and not self._row_is_header and self._current_section:
                self.sections[self._current_section]["table_rows"].append(self._row)
            self._row = None
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._link_parts is not None:
            self._link_parts.append(data)
        if self._in_strong:
            self._strong_parts.append(data)
        if self._cell is not None:
            self._cell.append(data)
        if getattr(self, "_in_chapter_index", False):
            self._chapter_index_parts.append(data)
        if self._current_section:
            section = self.sections[self._current_section]
            section["text"] += data
            if section["claims"]:
                section["claims"][-1] += data


def load():
    parser = PageParser()
    parser.feed(PAGE.read_text(encoding="utf-8"))
    parser.close()
    return parser


def html():
    return PAGE.read_text(encoding="utf-8")


def block(start_id, end_id=None):
    text = html()
    start = text.index(f'id="{start_id}"')
    end = text.index(f'id="{end_id}"', start) if end_id else len(text)
    return text[start:end]


def page_text(page_id, next_id=None):
    """Texto visible aproximado de una página (sin etiquetas)."""
    raw = block(page_id, next_id)
    raw = raw[raw.index(">") + 1:]  # descartar el resto de la etiqueta de apertura
    raw = raw[:raw.rfind("<")] if next_id else raw
    raw = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
    raw = re.sub(r"</?(em|strong|span|a)(\s[^>]*)?>", "", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return " ".join(raw.split())


SECTION_ORDER = ["inicio", "speaker", "lacrypta", "mito", "lightning", "wallets", "workshop"]
MITO_PAGES = ["mito-queja", "mito-capas"]
WALLETS_PAGES = ["wallets-llaves", "wallets-strike", "wallets-zeus", "wallets-lawallet", "wallets-lawallet-map", "wallets-tabla"]


class SectionStructureTests(unittest.TestCase):
    def test_sections_in_storyboard_order(self):
        self.assertEqual(load().section_ids, SECTION_ORDER)

    def test_mito_is_exactly_two_pages(self):
        self.assertEqual(load().pages.get("mito"), MITO_PAGES)

    def test_wallets_pages_come_before_the_table(self):
        self.assertEqual(load().pages.get("wallets"), WALLETS_PAGES)
        wallets = block("wallets", "workshop")
        self.assertLess(wallets.index('id="wallets-zeus"'), wallets.index('id="wallets-lawallet"'))
        self.assertLess(wallets.index('id="wallets-lawallet"'), wallets.index('id="wallets-lawallet-map"'))
        self.assertLess(wallets.index('id="wallets-lawallet-map"'), wallets.index('class="wallets-table"'))

    def test_pages_are_fullscreen_snap_steps(self):
        rule = re.search(r"\n\s*\.page\s*\{[^}]+\}", html())
        self.assertIsNotNone(rule, "falta la regla CSS .page")
        self.assertIn("scroll-snap-align: start", rule.group(0))
        self.assertIn("min-height: 100svh", rule.group(0))

    def test_paged_chapters_do_not_create_a_scroll_container(self):
        rule = re.search(r"\.chapter\.paged\s*\{[^}]+\}", html())
        self.assertIsNotNone(rule)
        self.assertIn("overflow: clip", rule.group(0))


class NavigationTests(unittest.TestCase):
    def expected_dots(self, page):
        dots = []
        for sid in page.section_ids:
            dots.extend("#" + pid for pid in page.pages.get(sid, [sid]))
        return dots

    def test_chapter_dots_match_every_snap_page(self):
        page = load()
        dots = [href for nav_class, href in page.nav_links if nav_class == "chapter-nav"]
        self.assertEqual(dots, self.expected_dots(page))

    def test_all_anchors_resolve_to_ids(self):
        page = load()
        self.assertEqual(sorted(set(page.anchors) - set(page.ids)), [])

    def test_ids_are_unique(self):
        ids = load().ids
        self.assertEqual(len(ids), len(set(ids)), "hay ids repetidos")

    def test_header_nav_covers_every_section(self):
        page = load()
        header = [href for nav_class, href in page.nav_links if nav_class == "header-nav"]
        for sid in page.section_ids:
            if sid != "inicio":
                self.assertIn("#" + sid, header, f"el header no enlaza a #{sid}")


class HeroTests(unittest.TestCase):
    EXPECTED_WALLETS = [
        "LaWallet",
        "Wallet of Satoshi",
        "Tether Wallet",
        "Cash App",
        "Strike",
        "Blink",
        "Phoenix",
        "Muun",
        "Bitkit",
        "Blixt",
        "BlueWallet",
        "ZEUS",
        "Aqua Wallet",
    ]
    ICON_FILES = [
        "icono-lawallet.webp",
        "icono-wos.webp",
        "icono-tether.webp",
        "icono-cashapp.webp",
        "icono-strike.webp",
        "icono-blink.webp",
        "icono-phoenix.webp",
        "icono-muun.webp",
        "icono-bitkit.webp",
        "icono-blixt.webp",
        "icono-bluewallet.webp",
        "icono-zeus.webp",
        "icono-aqua.webp",
    ]

    def test_drum_markup_and_local_icons(self):
        page = load()
        hero_html = block("inicio", "speaker")
        self.assertIn('id="drum-ring"', hero_html)
        self.assertIn("drum-stage", hero_html)
        self.assertIn("drum-tilt", hero_html)
        self.assertNotIn("wallet-grid", hero_html)
        self.assertNotIn("wallet-card", hero_html)
        for old in ("lawallet-logo.svg", "wos-logo.svg", "tether-logo-text.svg"):
            self.assertNotIn(old, hero_html)
        cards = page.sections["inicio"]["wallet_cards"]
        self.assertEqual(len(cards), 13)
        names = [c["name"] for c in cards]
        self.assertEqual(names, self.EXPECTED_WALLETS)
        for card in cards:
            self.assertIsNotNone(card["logo"], f"{card['name']} necesita un <img>")
            self.assertTrue(card["logo"].startswith("./assets/icono-"), card["logo"])
            logo = ROOT / card["logo"].lstrip("./")
            self.assertTrue(logo.is_file() and logo.stat().st_size > 0, f"falta {logo.name}")
            self.assertEqual(logo.suffix, ".webp")
        # alt vacío + nombre en strong.visually-hidden (parser ya lo leyó)
        for m in re.finditer(r'<img class="drum-icon"[^>]*>', hero_html):
            self.assertIn('alt=""', m.group(0))

    def test_drum_icon_sources_documented(self):
        sources = (ROOT / "assets" / "SOURCES.md").read_text(encoding="utf-8")
        self.assertIn("Portada: íconos de wallets", sources)
        for name in self.ICON_FILES:
            self.assertIn(name, sources, f"SOURCES.md no menciona {name}")

    def test_drum_respects_reduced_motion_and_pauses_offscreen(self):
        scripts = html()[html().index("Tambor de wallets"):]
        self.assertIn('prefers-reduced-motion: reduce', scripts)
        self.assertIn("IntersectionObserver", scripts)
        self.assertIn('getElementById("inicio")', scripts)
        self.assertIn("freeze", scripts)


class SpeakerTests(unittest.TestCase):
    REQUIRED = [
        "Community Manager de La Crypta · Programador en mis ratos libres",
        "Soy Fierillo, el oso de La Crypta.",
        "Estudié ingeniería y aprendí a programar por mi cuenta.",
        "Más de 20 proyectos, casi todos de código abierto.",
        "Bitcoin, Lightning, Nostr y herramientas para la comunidad.",
        "Honestidad · Minimalismo · Humildad · Curiosidad",
        "Más sobre mí en Fierillolandia ↗",
    ]

    def test_speaker_has_the_agreed_copy(self):
        text = page_text("speaker", "lacrypta")
        for line in self.REQUIRED:
            self.assertIn(line, text)

    def test_link_and_avatar(self):
        speaker = block("speaker", "lacrypta")
        self.assertIn('href="https://fierillolandia.vercel.app"', speaker)
        self.assertIn('alt="Retrato de Fierillo"', speaker)

    def test_no_project_cards_or_old_copy(self):
        text = page_text("speaker", "lacrypta")
        for old in ("Botillo", "Construyo para entender", "Curiosidad → código", "autodidacta"):
            self.assertNotIn(old, text)


class LaCryptaTests(unittest.TestCase):
    REQUIRED = [
        "La Crypta",
        "Comunidad de Bitcoin en Villanueva 1367, Belgrano.",
        "Aprendemos Bitcoin haciendo: en La Crypta se come lo que se cocina.",
        "6 hackatones en lo que va del año · Networking · Community Call",
        "Eventos que se pagan en sats.",
        "Que Bitcoin sea una experiencia, no una promesa.",
    ]
    PHOTOS = [
        "lacrypta-fachada.jpg",
        "lacrypta-patio.jpg",
        "lacrypta-mesa-de-trabajo.jpg",
        "lacrypta-almuerzo.jpg",
        "lacrypta-veintiuno.jpg",
        "lacrypta-neon-bitcoin.jpg",
    ]

    def test_copy(self):
        text = page_text("lacrypta", "mito")
        for line in self.REQUIRED:
            self.assertIn(line, text)

    def test_six_local_photos_with_spanish_alt(self):
        imgs = [i for i in load().image_details if i["section"] == "lacrypta"]
        self.assertEqual([Path(i["src"]).name for i in imgs], self.PHOTOS)
        for img in imgs:
            self.assertTrue(img["alt"] and len(img["alt"]) > 15, f"alt pobre en {img['src']}")

    def test_photos_are_web_optimized_without_exif(self):
        for name in self.PHOTOS:
            path = ROOT / "assets" / name
            self.assertTrue(path.is_file(), f"falta {name}")
            data = path.read_bytes()
            self.assertTrue(data.startswith(b"\xff\xd8"), f"{name} no es JPEG")
            self.assertLess(len(data), 300_000, f"{name} pesa demasiado")
            self.assertNotIn(b"Exif\x00\x00", data[:65536], f"{name} conserva EXIF")


class MitoTests(unittest.TestCase):
    def test_page_a_states_the_two_claims(self):
        page = load()
        mito = page.sections["mito"]
        self.assertEqual(len(mito["claims"]), 2, "el mito plantea exactamente dos afirmaciones")
        text = page_text("mito-queja", "mito-capas")
        for line in (
            "“Bitcoin es caro y lento.”",
            "La queja más escuchada. Veamos qué hay detrás antes de responder.",
            "Es caro",
            "Las comisiones suben cuando hay mucha demanda. En horarios pico, una transferencia puede costar varios dólares.",
            "Es lento",
            "Un bloque sale cada ~10 minutos en promedio. Para pagar un café, eso es eterno.",
        ):
            self.assertIn(line, text)

    def test_page_b_answers_with_layers(self):
        text = page_text("mito-capas", "lightning")
        for line in (
            "¿Son ciertas?",
            "Sí, pero en la capa 1.",
            "La capa 1 se compara con la liquidación de un banco central: lenta, cara y definitiva.",
            "Para pagar rápido y barato, el sistema tradicional usa una capa 2: Visa, Mastercard.",
            "Bitcoin también tiene su capa 2: se llama Lightning.",
        ):
            self.assertIn(line, text)

    def test_page_b_has_only_the_title_and_three_lines(self):
        raw = block("mito-capas", "lightning")
        paragraphs = re.findall(r"<(p|h3|h4)\b[^>]*>(.*?)</\1>", raw, flags=re.S)
        texts = [" ".join(re.sub(r"<[^>]+>", "", body).split()) for _, body in paragraphs]
        self.assertEqual(
            texts,
            [
                "¿Son ciertas?",
                "Sí, pero en la capa 1.",
                "La capa 1 se compara con la liquidación de un banco central: lenta, cara y definitiva.",
                "Para pagar rápido y barato, el sistema tradicional usa una capa 2: Visa, Mastercard.",
                "Bitcoin también tiene su capa 2: se llama Lightning.",
            ],
        )

    def test_lightning_bridge_line_is_highlighted(self):
        raw = block("mito-capas", "lightning")
        card = re.search(r'<div class="layer-card">\s*<p>([^<]+)</p>\s*</div>', raw)
        self.assertIsNotNone(card, "la línea puente debe ir en la tarjeta destacada")
        self.assertEqual(card.group(1), "Bitcoin también tiene su capa 2: se llama Lightning.")
        rule = re.search(r"\.layer-card p\s*\{[^}]+\}", html())
        self.assertIn("color: var(--orange)", rule.group(0))

    def test_old_extra_copy_is_gone(self):
        text = page_text("mito", "lightning")
        for old in (
            "Lo que siempre dicen",
            "Una red construida encima de Bitcoin",
            "Pero esto se resuelve",
            "El espacio es escaso a propósito",
            "Agrandar los bloques",
            "La capa 2 de Bitcoin.",
            "Pagos por canales, al instante y casi sin costo",
        ):
            self.assertNotIn(old, text)


class LightningAnimationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.block = block("lightning", "wallets")
        cls.html = html()

    def test_minimal_copy(self):
        text = page_text("lightning", "wallets")
        for label in ("Lightning", "Red Lightning", "Un rayo"):
            self.assertIn(label, text)

    def test_network_and_bolt_are_present_and_namespaced(self):
        for needle in ('id="ln-net"', 'id="ln-video"', 'id="ln-glow"', 'class="ln-panel ln-panel-net"'):
            self.assertIn(needle, self.block)
        for bare in ('id="net"', 'id="sky"', 'id="glow"', 'id="route"', 'id="chip"'):
            self.assertNotIn(bare, self.html, f"id sin namespace: {bare}")

    def test_payment_balances_and_labels(self):
        self.assertIn("de 50 a 40", self.block)
        self.assertIn("de 50 a 60", self.block)
        for label in ('"vos"', '"café"', '"40"', '"60"'):
            self.assertIn(label, self.html, f"falta {label} en la animación")

    def test_starts_when_visible_and_respects_reduced_motion(self):
        self.assertIn("IntersectionObserver", self.html)
        self.assertIn('matchMedia("(prefers-reduced-motion: reduce)")', self.html)

    def test_explanatory_copy(self):
        text = page_text("lightning", "wallets")
        for line in (
            "Tu pago prueba rutas por la red. Si un canal no tiene saldo, vuelve y prueba otra.",
            "Cuando encuentra una que llega, el pago pasa entero, en un instante.",
            "Un rayo hace lo mismo: tantea caminos hacia el suelo y descarga solo por el que conecta.",
        ):
            self.assertIn(line, text)

    def test_real_lightning_video_is_local_muted_looping_with_poster(self):
        tag = re.search(r"<video\b[^>]*>", self.block)
        self.assertIsNotNone(tag, "falta el <video> del rayo")
        tag = tag.group(0)
        for attr in ("autoplay", "muted", "loop", "playsinline"):
            self.assertRegex(tag, rf"\s{attr}[\s>/=]", f"al video le falta {attr}")
        poster = re.search(r'poster="\./([^"]+)"', tag)
        self.assertIsNotNone(poster, "el video necesita poster local")
        self.assertTrue((ROOT / poster.group(1)).is_file())
        sources = re.findall(r'<source src="\./([^"]+)" type="video/(mp4|webm)"', self.block)
        self.assertIn("mp4", [kind for _, kind in sources], "falta la versión MP4")
        for src, _ in sources:
            path = ROOT / src
            self.assertTrue(path.is_file(), f"no existe {src}")
            self.assertLess(path.stat().st_size, 3_000_000, f"{src} pesa demasiado")
        self.assertNotIn("http", "".join(s for s, _ in sources), "nada de hotlinking")

    def test_video_credit_and_sources_entry(self):
        text = page_text("lightning", "wallets")
        self.assertIn("MrNousia", text)
        self.assertIn("CC BY 3.0", text)
        sources = (ROOT / "assets" / "SOURCES.md").read_text(encoding="utf-8")
        for needle in ("rayo-camara-lenta.mp4", "MrNousia", "CC BY 3.0",
                       "commons.wikimedia.org/wiki/File:Lightning_strikes_in_slow_motion", "Modificaciones"):
            self.assertIn(needle, sources)

    def test_canvas_bolt_was_removed_and_nodes_follow_the_video(self):
        self.assertNotIn("<canvas", self.html)
        self.assertNotIn("buildBolt", self.html)
        self.assertIn("video.currentTime", self.html)
        self.assertIn("V_STROKE", self.html)

    def test_old_scheme_is_gone(self):
        for old in ('class="scheme"', "chip-travel", 'class="node-value', "flow-list"):
            self.assertNotIn(old, self.html)

    def test_scripts_live_outside_sections(self):
        main = self.html[self.html.index("<main>"):self.html.index("</main>")]
        self.assertNotIn("<script", main)


class WalletPagesTests(unittest.TestCase):
    def test_keys_page(self):
        text = page_text("wallets-llaves", "wallets-strike")
        for line in (
            "¿Quién tiene las llaves?",
            "Custodial",
            "Alguien guarda las llaves por vos. Fácil para empezar, pero tus sats dependen de un tercero.",
            "Autocustodial",
            "Las llaves son tuyas. Más responsabilidad, nadie te puede congelar los fondos.",
            "Para probar con poco, cualquiera. Para guardar, autocustodial.",
        ):
            self.assertIn(line, text)

    def test_strike_page(self):
        text = page_text("wallets-strike", "wallets-zeus")
        for line in (
            "Custodial",
            "Te registrás, verificás tu identidad y ya podés mandar y recibir por Lightning.",
            "Sin frase de recuperación: tu cuenta es tu acceso.",
            "Los sats los guarda la empresa por vos.",
            "A favor", "Muy fácil · Ideal para empezar con poco",
            "En contra", "Te piden tus datos · Si la empresa te bloquea, no tenés tus sats",
        ):
            self.assertIn(line, text)
        self.assertNotIn("Autocustodial", text)

    def test_zeus_page(self):
        text = page_text("wallets-zeus", "wallets-lawallet")
        for line in (
            "Autocustodial",
            "Tus llaves, tu nodo, tus canales.",
            "Para recibir necesitás liquidez de entrada. Para pagar, canales con saldo.",
            "Frase de recuperación + respaldo de canales.",
            "A favor", "Control total · Nadie te puede bloquear",
            "En contra", "Curva de aprendizaje alta · Si te equivocás, lo resolvés vos",
        ):
            self.assertIn(line, text)

    def test_lawallet_page(self):
        text = page_text("wallets-lawallet", "wallets-lawallet-map")
        for line in (
            "Autocustodia progresiva",
            "Empezás con poca fricción: alias a una address que ya tengas, o una NWC de cortesía vía LNcurl.",
            "Cuando estás listo, conectás tu propia NWC (Alby, Primal u otra compatible).",
            "Lightning Address en el dominio de la comunidad. Código abierto.",
            "A favor", "Escalá a tu ritmo · Dirección Lightning de la comunidad",
            "En contra", "Al inicio podés depender de una wallet de cortesía · Pasar a tu NWC es un paso más",
        ):
            self.assertIn(line, text)

    def test_lawallet_is_featured_with_progressive_tag_and_app_shot(self):
        raw = block("wallets-lawallet", "wallets-lawallet-map")
        self.assertIn('class="claim-tag is-progressive"', raw)
        self.assertNotIn("is-custody", raw)
        self.assertIn('class="app-logo is-featured lb-trigger"', raw)
        self.assertIn('src="./assets/lawallet-app-inicio.jpg"', raw)
        self.assertIn('<figure class="app-shot">', raw)
        self.assertNotIn("is-landscape", raw)
        css = html()
        for rule in (r"\.claim-tag\.is-progressive\s*\{", r"\.app-logo\.is-featured\s*\{"):
            self.assertRegex(css, rule)

    def test_lawallet_map_page(self):
        text = page_text("wallets-lawallet-map", "wallets-tabla")
        for line in (
            "Varias Lightning Address.",
            "Podés configurar más de una address en la misma cuenta.",
            "En cada una elegís LNcurl (cortesía) o conectar tu propia NWC.",
            "El mapa muestra cómo se enlazan addresses y wallets.",
        ):
            self.assertIn(line, text)
        raw = block("wallets-lawallet-map", "wallets-tabla")
        self.assertIn('src="./assets/lawallet-connection-map.jpg"', raw)
        self.assertIn('class="app-shot is-landscape"', raw)

    def test_app_pages_show_local_logo_and_real_screenshot(self):

        imgs = load().image_details
        for page_id, logo, shot in (
            ("wallets-strike", "strike-logo.svg", "strike-app-inicio.jpg"),
            ("wallets-zeus", "zeus-logo.svg", "zeus-canales.jpg"),
            ("wallets-lawallet", "lawallet-logo.svg", "lawallet-app-inicio.jpg"),
        ):
            names = {Path(i["src"]).name: i for i in imgs if i["page"] == page_id}
            for name in (logo, shot):
                self.assertIn(name, names, f"falta {name} en {page_id}")
                self.assertTrue(names[name]["alt"], f"{name} sin alt")
                path = ROOT / "assets" / name
                self.assertTrue(path.is_file() and path.stat().st_size > 0, f"{name} no existe")
            self.assertGreater(len(names[shot]["alt"]), 20)

    def test_every_image_has_alt_and_exists_locally(self):
        for img in load().image_details:
            self.assertIsNotNone(img["alt"], f"{img['src']} sin atributo alt")
            if img["src"].startswith("./"):
                self.assertTrue((ROOT / img["src"][2:]).is_file(), f"no existe {img['src']}")


class WalletsTableTests(unittest.TestCase):
    REQUIRED = ["LaWallet", "Wallet of Satoshi", "Tether Wallet", "Cash App", "Strike", "Phoenix", "Aqua Wallet"]
    FORBIDDEN = ["Ledger", "Sparrow", "Exodus", "Trust Wallet"]

    def test_table_lists_mobile_lightning_wallets(self):
        rows = load().sections["wallets"]["table_rows"]
        names = [r[0] for r in rows]
        for name in self.REQUIRED:
            self.assertIn(name, names, f"falta la wallet {name}")
        self.assertGreaterEqual(len(rows), 10, "la tabla debe tener 10+ wallets")

    def test_table_excludes_wallets_without_lightning(self):
        names = [r[0] for r in load().sections["wallets"]["table_rows"]]
        for name in self.FORBIDDEN:
            self.assertNotIn(name, names, f"{name} no tiene Lightning: fuera")

    def test_every_row_has_custody_pro_and_contra_columns(self):
        for row in load().sections["wallets"]["table_rows"]:
            self.assertEqual(len(row), 4, f"fila incompleta: {row}")
            self.assertTrue(row[1].strip(), f"custodia vacía en {row[0]}")
            self.assertTrue(row[2].strip(), f"pro vacío en {row[0]}")
            self.assertTrue(row[3].strip(), f"contra vacío en {row[0]}")

    def test_table_headers_are_wallet_custody_pro_contra(self):
        raw = html()
        self.assertIn("<th>Wallet</th>", raw)
        self.assertIn("<th>Custodia</th>", raw)
        self.assertIn("<th>Pro</th>", raw)
        self.assertIn("<th>Contra</th>", raw)
        self.assertNotIn("<th>Lightning</th>", raw)



    def test_agreed_pro_contra_copy(self):
        rows = {r[0]: r for r in load().sections["wallets"]["table_rows"]}
        self.assertEqual(rows["LaWallet"][3], "NWC requiere configuración adicional")
        self.assertIn("Spark", rows["Wallet of Satoshi"][3])
        self.assertIn("federación", rows["Wallet of Satoshi"][3])
        self.assertIn("Indra", rows["Aqua Wallet"][2])
        self.assertIn("no depositar", rows["Aqua Wallet"][3].lower())

    def test_wallets_table_css_forbids_cell_ellipsis_truncation(self):
        raw = html()
        # Reglas compartidas de celda + primera columna.
        cell_rule = re.search(
            r"\.wallets-table th,\s*\.wallets-table td\s*\{[^}]+\}",
            raw,
        )
        self.assertIsNotNone(cell_rule, "falta la regla compartida .wallets-table th/td")
        cell_body = cell_rule.group(0)
        self.assertNotIn("text-overflow: ellipsis", cell_body)
        self.assertNotIn("overflow: hidden", cell_body)
        self.assertIn("overflow: visible", cell_body)
        self.assertIn("text-overflow: clip", cell_body)

        first_rule = re.search(
            r"\.wallets-table td:first-child,\s*\.wallets-table th:first-child\s*\{[^}]+\}"
            r"|\.wallets-table td:first-child\s*\{[^}]+\}",
            raw,
        )
        self.assertIsNotNone(first_rule, "falta regla de primera columna")
        first_body = first_rule.group(0)
        self.assertNotIn("text-overflow: ellipsis", first_body)
        self.assertNotIn("overflow: hidden", first_body)

        wrap = re.search(r"\.table-wrap\s*\{[^}]+\}", raw)
        self.assertIsNotNone(wrap, "falta .table-wrap")
        self.assertIn("overflow-x: auto", wrap.group(0))

    def test_wallets_tabla_page_scrolls_instead_of_clipping(self):
        raw = html()
        rule = re.search(r"#wallets-tabla\.page\s*\{[^}]+\}", raw)
        self.assertIsNotNone(rule, "falta #wallets-tabla.page")
        body = rule.group(0)
        self.assertIn("overflow-y: auto", body)
        self.assertIn("max-height: 100svh", body)

    def test_pro_contra_full_strings_present_untruncated(self):
        raw = html()
        expected = {
            "Aqua Wallet": (
                "L-BTC + pagar BOLT11 / retirar vía LN (Indra)",
                "No es LN nativo; sacar por LN sí, no depositar por LN; depende del swap",
            ),
            "BlueWallet": (
                "On-chain sólido",
                "LN: tu LNDHub o Arkade (Ark+swaps, no LN nativo). lndhub.io ya no existe",
            ),
            "Wallet of Satoshi": (
                "Muy simple; Lightning y on-chain",
                "Spark: federación, sin canales LN propios",
            ),
            "ZEUS": (
                "Control total en modos nodo; frase + respaldo de canales",
                "Cashu no es autocustodial. Curva media/alta. Swaps ZEUS suspendidos. Sin Spark",
            ),
        }
        rows = {r[0]: r for r in load().sections["wallets"]["table_rows"]}
        for name, (pro, contra) in expected.items():
            self.assertIn(pro, raw, f"Pro de {name} truncado o ausente en HTML")
            self.assertIn(contra, raw, f"Contra de {name} truncado o ausente en HTML")
            self.assertEqual(rows[name][2], pro, f"Pro parseado de {name} no coincide")
            self.assertEqual(rows[name][3], contra, f"Contra parseado de {name} no coincide")


class ChapterIndexTests(unittest.TestCase):
    def test_chapter_indexes_are_sequential(self):
        page = load()
        numbered = [
            (sid, page.sections[sid]["chapter_index"])
            for sid in page.section_ids
            if page.sections[sid]["chapter_index"]
        ]
        self.assertEqual(len(numbered), len(page.section_ids) - 1, "cada sección salvo la portada lleva índice")
        for position, (sid, index) in enumerate(numbered, start=1):
            self.assertEqual(index, f"{position:02d}", f"índice malo en {sid}: {index}")

    def test_one_index_per_section(self):
        for sid in SECTION_ORDER:
            sec = block(sid, SECTION_ORDER[SECTION_ORDER.index(sid) + 1]) if sid != "workshop" else block(sid)
            self.assertLessEqual(sec.count('class="chapter-index"'), 1, f"{sid} repite índice")


class LayoutContractTests(unittest.TestCase):
    def test_scroll_snap_is_enabled_on_document_and_chapters(self):
        text = html()
        self.assertIn("scroll-snap-type: y mandatory", text)
        self.assertIn("scroll-snap-align: start", text)

    def test_page_adapts_to_small_screens(self):
        self.assertRegex(html(), r"@media \(max-width: \d+px\)")

    def test_respects_reduced_motion_preference(self):
        self.assertIn("prefers-reduced-motion", html())


class CopyToneTests(unittest.TestCase):
    # Se buscan como subcadenas (más estricto que por palabra completa).
    BANNED = ["charla", "workshop", "objection", "builder", "speaker", "invoice", "hop", "ábaco", "abaco"]

    @classmethod
    def setUpClass(cls):
        page = load()
        cls.visible = " ".join(
            [page.title, page.meta_description]
            + [page.sections[sid]["text"] for sid in page.section_ids]
            + [text for _, text in page.nav_texts]
            + page.announced
        ).lower()

    def test_visible_copy_has_no_noise_or_english_words(self):
        for word in self.BANNED:
            self.assertNotIn(word, self.visible, f"'{word}' no debe aparecer en el copy visible")

    def test_no_placeholder_left_behind(self):
        for word in ("placeholder", "lorem ipsum", "pendiente de imagen"):
            self.assertNotIn(word, self.visible)



class StickySectionTitleTests(unittest.TestCase):
    def test_sticky_label_markup_exists_outside_chapters(self):
        raw = html()
        self.assertIn('id="section-sticky"', raw)
        self.assertIn('class="section-sticky"', raw)
        # El marcador vive fuera de los capítulos para no duplicar chapter-index por sección.
        sticky = re.search(
            r'<div class="section-sticky"[^>]*>\s*<p class="chapter-index"></p>\s*</div>',
            raw,
        )
        self.assertIsNotNone(sticky, "falta el contenedor section-sticky con chapter-index vacío")
        self.assertLess(raw.index('id="section-sticky"'), raw.index("<main>"))

    def test_sticky_sits_below_site_header(self):
        rule = re.search(r"\.section-sticky\s*\{[^}]+\}", html())
        self.assertIsNotNone(rule, "falta la regla CSS .section-sticky")
        body = rule.group(0)
        self.assertIn("position: fixed", body)
        self.assertIn("top: var(--header-height)", body)
        self.assertIn("z-index: 8", body)

    def test_sticky_script_tracks_chapters_and_skips_hero(self):
        scripts = html()[html().index('id="section-sticky"') :]
        self.assertIn("function syncSticky", scripts)
        self.assertIn('querySelectorAll("main > .chapter")', scripts)
        self.assertIn('active.id === "inicio"', scripts)
        self.assertIn("label.innerHTML", scripts)
        self.assertIn("requestAnimationFrame(syncSticky)", scripts)

    def test_sticky_hides_while_inflow_chapter_index_is_visible(self):
        raw = html()
        start = raw.index('getElementById("section-sticky")')
        scripts = raw[start : raw.index("</script>", start)]
        self.assertIn("function inflowIndexVisible", scripts)
        self.assertIn("function headerBand", scripts)
        self.assertIn("--header-height", scripts)
        self.assertIn("getBoundingClientRect", scripts)
        # Solo muestra la barra fija cuando el índice in-flow ya no está a la vista.
        self.assertIn("inflowIndexVisible(active.indexEl)", scripts)
        self.assertRegex(
            scripts,
            r"if \(inflowIndexVisible\(active\.indexEl\)\) \{[\s\S]*?hideSticky\(\)",
        )

    def test_overflow_unchanged_on_paged_chapters(self):
        # Sticky es JS/fixed; no hace falta abrir overflow (rompe el contrato de snap).
        rule = re.search(r"\.chapter\.paged\s*\{[^}]+\}", html())
        self.assertIsNotNone(rule)
        self.assertIn("overflow: clip", rule.group(0))


class LightboxTests(unittest.TestCase):
    def test_lightbox_dialog_markup(self):
        raw = html()
        self.assertIn('id="lightbox"', raw)
        self.assertIn('role="dialog"', raw)
        self.assertIn('aria-modal="true"', raw)
        self.assertIn('aria-label="Imagen ampliada"', raw)
        self.assertIn('aria-label="Cerrar imagen"', raw)
        self.assertIn('class="lightbox-img"', raw)
        self.assertIn('class="lightbox-close"', raw)

    def test_eligible_images_are_triggers(self):
        raw = html()
        for needle in (
            'class="drum-icon lb-trigger"',
            'class="app-logo lb-trigger"',
            'class="lb-trigger"',
        ):
            self.assertIn(needle, raw)
        self.assertGreaterEqual(raw.count("lb-trigger"), 20)
        # Fotos Crypta + capturas de apps
        self.assertEqual(raw.count('figure class="lc-photo"'), 6)
        self.assertEqual(len(re.findall(r'<figure class="lc-photo"[^>]*>\s*<img class="lb-trigger"', raw)), 6)
        self.assertEqual(len(re.findall(r'<figure class="app-shot[^"]*"[^>]*>\s*<img class="lb-trigger"', raw)), 4)

    def test_lightbox_script_handles_open_close_and_a11y(self):
        scripts = html()[html().index("Lightbox compartido"):]
        for needle in (
            'getElementById("lightbox")',
            'Escape',
            "lb-open",
            "lastFocus",
            "preventDefault",
            'role", "button"',
            'tabindex',
        ):
            self.assertIn(needle, scripts)


if __name__ == "__main__":
    unittest.main()
