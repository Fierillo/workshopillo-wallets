"""Integridad del documento; el comportamiento visual se comprueba en navegador."""

import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.stack = []
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        element = {
            "tag": tag,
            "attrs": dict(attrs),
            "parents": tuple(self.stack),
            "text": "",
        }
        self.elements.append(element)
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        for element in self.stack:
            element["text"] += data

    def tags(self, tag):
        return [element for element in self.elements if element["tag"] == tag]


def has_class(element, name):
    return name in element["attrs"].get("class", "").split()


class PageIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = Document((ROOT / "index.html").read_text(encoding="utf-8"))
        cls.ids = [
            element["attrs"]["id"]
            for element in cls.document.elements
            if "id" in element["attrs"]
        ]

    def test_ids_are_nonempty_and_unique(self):
        self.assertTrue(self.ids)
        self.assertTrue(all(self.ids))
        self.assertEqual(len(self.ids), len(set(self.ids)))

    def test_internal_links_resolve(self):
        links = [element["attrs"].get("href", "") for element in self.document.tags("a")]
        for href in links:
            if href.startswith("#"):
                with self.subTest(href=href):
                    self.assertIn(unquote(href[1:]), self.ids)

    def test_accessible_name_references_resolve(self):
        for element in self.document.elements:
            for attr in ("aria-labelledby", "aria-describedby"):
                for target in element["attrs"].get(attr, "").split():
                    with self.subTest(tag=element["tag"], attribute=attr, target=target):
                        self.assertIn(target, self.ids)

    def test_page_navigation_matches_document_order(self):
        pages = [
            element for element in self.document.elements
            if has_class(element, "page")
            or (has_class(element, "chapter") and not has_class(element, "paged"))
        ]
        links = [
            element for element in self.document.tags("a")
            if any(has_class(parent, "chapter-nav") for parent in element["parents"])
        ]
        self.assertTrue(pages)
        self.assertEqual(
            [link["attrs"].get("href") for link in links],
            ["#" + page["attrs"]["id"] for page in pages],
        )

    def test_local_resources_exist_and_fit_size_budget(self):
        resources = set()
        for element in self.document.elements:
            for attr in ("src", "poster", "href", "data-image", "data-image-next"):
                value = element["attrs"].get(attr, "")
                url = urlsplit(value)
                if url.path and not url.scheme and not url.netloc:
                    resources.add(unquote(url.path))
        self.assertTrue(resources)
        for resource in sorted(resources):
            with self.subTest(resource=resource):
                path = ROOT / resource.lstrip("/")
                self.assertTrue(path.is_file(), f"Falta {resource}")
                self.assertGreater(path.stat().st_size, 0)
                self.assertLess(
                    path.stat().st_size, 3_000_000,
                    f"{resource} supera el presupuesto de 3 MB",
                )

    def test_images_have_alt(self):
        images = self.document.tags("img")
        self.assertTrue(images)
        for image in images:
            with self.subTest(src=image["attrs"].get("src")):
                self.assertIn("alt", image["attrs"])

    def test_disclosures_have_a_summary_and_content(self):
        disclosures = self.document.tags("details")
        self.assertTrue(disclosures)
        for disclosure in disclosures:
            summaries = [
                summary for summary in self.document.tags("summary")
                if summary["parents"][-1] is disclosure
            ]
            with self.subTest(disclosure=disclosure["text"].strip()):
                self.assertEqual(len(summaries), 1)
                self.assertTrue(summaries[0]["text"].strip())
                self.assertNotEqual(disclosure["text"].strip(), summaries[0]["text"].strip())



    def test_language_switch_lives_in_top_header(self):
        headers = [
            element for element in self.document.tags("header")
            if has_class(element, "site-header")
        ]
        self.assertEqual(len(headers), 1, "Debe existir un header superior site-header")
        self.assertFalse(
            any(element["attrs"].get("id") == "section-sticky" for element in self.document.elements),
            "No debe existir una segunda barra section-sticky",
        )
        title = [
            element for element in self.document.tags("p")
            if element["attrs"].get("id") == "header-section-title"
            and any(parent is headers[0] for parent in element["parents"])
        ]
        self.assertEqual(len(title), 1, "El título de sección vive dentro del mismo site-header")
        self.assertIn("is-idle", title[0]["attrs"].get("class", "").split())
        self.assertNotIn("hidden", title[0]["attrs"])
        switches = [
            element for element in self.document.elements
            if has_class(element, "lang-switch")
            and any(parent is headers[0] for parent in element["parents"])
        ]
        self.assertEqual(len(switches), 1)
        buttons = [
            element for element in self.document.tags("button")
            if any(parent is switches[0] for parent in element["parents"])
        ]
        langs = [button["attrs"].get("data-lang") for button in buttons]
        self.assertEqual(langs, ["en", "es"])
        self.assertTrue(all(button["text"].strip() in {"EN", "ES"} for button in buttons))


    def test_document_defaults_to_spanish_lang(self):
        html = next(element for element in self.document.elements if element["tag"] == "html")
        self.assertEqual(html["attrs"].get("lang"), "es")


    def test_i18n_phrase_map_covers_translatable_leaves_and_attrs(self):
        from tests.i18n_coverage import (
            missing_translations,
            unapplied_strong_prefix_paragraphs,
            credit_thanks_targets,
        )
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        phrases, missing_text, missing_attr = missing_translations(source)
        self.assertGreaterEqual(len(phrases), 200)
        self.assertEqual(missing_text[:15], [], f"Textos sin EN ({len(missing_text)})")
        self.assertEqual(missing_attr[:15], [], f"Attrs sin EN ({len(missing_attr)})")
        self.assertEqual(
            unapplied_strong_prefix_paragraphs(source)[:10],
            [],
            "La tabla final debe poder aplicarse con <strong> + resto sin aplanar",
        )
        self.assertEqual(
            credit_thanks_targets(source),
            [],
            "Agradecimientos traducibles deben estar en phrases",
        )

    def test_i18n_engine_exposes_t_and_default_spanish(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("window.WorkshopilloI18n", source)
        self.assertIn('const STORAGE_KEY = "workshopillo-lang"', source)
        html = next(element for element in self.document.elements if element["tag"] == "html")
        self.assertEqual(html["attrs"].get("lang"), "es")


    def test_workshop_acceso_slide_removed(self):
        self.assertNotIn("workshop-acceso", self.ids)
        hrefs = [
            element["attrs"].get("href", "")
            for element in self.document.tags("a")
        ]
        self.assertNotIn("#workshop-acceso", hrefs)
        # La Crypta is followed by the myth chapter in document order
        chapters = [
            element for element in self.document.elements
            if has_class(element, "chapter") and not has_class(element, "paged")
            or (has_class(element, "chapter") and element["attrs"].get("id") in {"lacrypta", "mito", "inicio", "speaker", "creditos"})
        ]
        # Simpler: ids of top-level chapters in order from parser stack is hard; use id list sequence in file order
        ordered = [
            element["attrs"]["id"]
            for element in self.document.elements
            if element["tag"] == "section" and "id" in element["attrs"] and has_class(element, "chapter")
        ]
        self.assertIn("lacrypta", ordered)
        self.assertIn("mito", ordered)
        self.assertEqual(ordered[ordered.index("lacrypta") + 1], "mito")
        # nav order still matches pages (existing test covers); ensure myth nav follows lacrypta
        links = [
            element["attrs"].get("href")
            for element in self.document.tags("a")
            if any(has_class(parent, "chapter-nav") for parent in element["parents"])
        ]
        self.assertEqual(links[links.index("#lacrypta") + 1], "#mito-queja")


    def test_table_and_credits_i18n_are_applicable(self):
        from tests.i18n_coverage import unapplied_strong_prefix_paragraphs, credit_thanks_targets
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertEqual(unapplied_strong_prefix_paragraphs(source), [])
        self.assertEqual(credit_thanks_targets(source), [])
        self.assertIn("function applyStrongPrefix", source)
        self.assertIn("nodes.forEach(captureSource)", source)

if __name__ == "__main__":
    unittest.main()
