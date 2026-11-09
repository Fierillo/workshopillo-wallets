"""Coverage helpers for Workshopillo i18n phrase map."""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOID = {"img","br","hr","meta","input","source","wbr","area","col","embed","track","param","link","base"}
ATTRS = ("aria-label","alt","title","content","data-caption","data-alt","data-caption-next","data-alt-next")
BRANDS = {
    "LaWallet","Wallet of Satoshi","Tether Wallet","Strike","Blink","Phoenix","Muun","Bitkit","Blixt","Blixt Wallet",
    "BlueWallet","ZEUS","Aqua Wallet","Spark","Bitcoin","Lightning","Cashu","WoS","La Crypta","Fierillo","Jaqui","Andy","Baba",
    "Veintiuno.lat","EN","ES","Wallet","Minibits","WesternBTC","Coinos","Alby","Primal","MrNousia","CC BY 3.0","JAN3","Indra",
    "Lightning Address","workshop.fierillo.world","vos@wallet.example",
}
CLASS_OK = {
    "eyebrow","lead","punch","micro-label","pc-label","claim-tag","wallet-showcase-foot",
    "speaker-values-line","comparison-note","ln-label","ln-text","ln-credit","wos-step-description","speaker-link",
    "is-action","wallet-option-address","wallet-option-custody","wallet-option-code","button",
}
PHRASE = {"em","strong","code","br","a"}


class Node:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {})
        self.stack = [self.root]
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag in {"script", "style"}:
            self.skip += 1
            self.stack.append(node)
            return
        if self.skip:
            return
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in {"script", "style"}:
            self.skip = max(0, self.skip - 1)
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if not self.skip:
            self.stack[-1].children.append(data)


def serialize(node):
    if isinstance(node, str):
        return node
    if node.tag == "root":
        return "".join(serialize(c) for c in node.children)
    attrs = "".join(f' {k}="{v}"' for k, v in node.attrs.items())
    if node.tag in VOID:
        return f"<{node.tag}{attrs}>"
    return f"<{node.tag}{attrs}>{''.join(serialize(c) for c in node.children)}</{node.tag}>"


def inner_html(node):
    return "".join(serialize(c) for c in node.children)


def child_elements(node):
    return [c for c in node.children if not isinstance(c, str)]


def is_leaf(node):
    if node.tag in {"script", "style", "svg", "nav", "header", "em", "strong"}:
        return False
    classes = set(node.attrs.get("class", "").split())
    if node.attrs.get("data-lang") or "lang-switch" in classes or "drum-name" in classes or "visually-hidden" in classes:
        return False
    if "chapter-index" in classes or ("claim-tag" in classes and "is-mixed" in classes):
        return False
    kids = child_elements(node)

    def ok_kid(k):
        if k.tag in PHRASE:
            return True
        if k.tag == "span" and (k.attrs.get("aria-hidden") == "true" or "wos-step-description" in k.attrs.get("class", "").split()):
            return True
        return False

    if kids and not all(ok_kid(k) for k in kids):
        return False
    if node.tag in {"h1", "h2", "h3", "p", "li", "figcaption", "button", "a", "small", "title"}:
        return True
    if node.tag == "span":
        return bool(classes & (CLASS_OK | {"claim-tag"}))
    return False


def load_phrases(source: str) -> dict:
    m = re.search(r"const phrases = \{([\s\S]*?)\n        \};", source)
    if not m:
        raise AssertionError("Falta const phrases")
    return json.loads("{" + m.group(1) + "}")


def missing_translations(source: str):
    phrases = load_phrases(source)
    body = source[source.find("<body>"):]
    parts = re.split(r"(<script\b[^>]*>.*?</script>)", body, flags=re.S | re.I)
    dom = "".join(p for p in parts if not re.match(r"<script\b", p, re.I))
    builder = Builder()
    builder.feed(dom)
    builder.close()
    missing_text = []
    missing_attr = []

    def walk(node, in_svg=False):
        if isinstance(node, str):
            return
        if node.tag == "svg":
            in_svg = True
        if node.tag in {"script", "style"}:
            return
        if not in_svg:
            for a in ATTRS:
                if a in node.attrs and node.attrs[a].strip():
                    t = node.attrs[a].strip()
                    if t not in BRANDS and not t.startswith("http") and not re.fullmatch(r"[\d\s./—↓↗→←×/-]+", t):
                        if t not in phrases:
                            missing_attr.append(t)
            # data-i18n / data-i18n-html are applied via messages, not phrases
            if node.attrs.get("data-i18n") or node.attrs.get("data-i18n-html"):
                pass
            elif is_leaf(node):
                text = " ".join(re.sub("<[^>]+>", "", inner_html(node)).split()).strip()
                if text and text not in BRANDS and not re.fullmatch(r"[\d\s./—↓↗→←×/-]+", text):
                    if text not in phrases:
                        missing_text.append(text)
        for child in node.children:
            walk(child, in_svg)

    walk(builder.root)
    return phrases, missing_text, missing_attr



def unapplied_strong_prefix_paragraphs(source: str):
    """Paragraphs like <p><strong>Label</strong> rest</p> that phrases cannot apply."""
    import re
    import json
    m = re.search(r"const phrases = \{([\s\S]*?)\n        \};", source)
    phrases = json.loads("{" + m.group(1) + "}")
    bad = []
    for block in re.findall(r'<div class="wallet-explanation">([\s\S]*?)</div>', source):
        for raw in re.findall(r"<p>([\s\S]*?)</p>", block):
            mlabel = re.match(r"\s*<strong>([^<]+)</strong>([\s\S]*)", raw)
            if not mlabel:
                bad.append(("shape", raw[:80]))
                continue
            label = mlabel.group(1)
            full = " ".join(re.sub("<[^>]+>", "", raw).split())
            en_full = phrases.get(full)
            en_label = phrases.get(label)
            if not en_full:
                bad.append(("missing-full", full))
            elif not en_label:
                bad.append(("missing-label", label))
            elif not en_full.startswith(en_label):
                bad.append(("prefix", full, en_full[:60]))
    return bad


def credit_thanks_targets(source: str):
    import re
    import json
    m = re.search(r"const phrases = \{([\s\S]*?)\n        \};", source)
    phrases = json.loads("{" + m.group(1) + "}")
    cred = re.search(r'<section class="chapter" id="creditos"[\s\S]*?</section>', source)
    if not cred:
        return ["missing-creditos-section"]
    block = cred.group(0)
    needed = []
    for strong in re.findall(r"<strong>([^<]+)</strong>", block):
        needed.append(strong)
    for lead in re.findall(r'<p class="lead">([^<]+)</p>', block):
        needed.append(lead.strip())
    for h2 in re.findall(r"<h2[^>]*>([^<]+)</h2>", block):
        needed.append(h2.strip())
    brands = {"Jaqui", "Andy", "Baba", "La Crypta", "Veintiuno.lat"}
    missing = [t for t in needed if t not in brands and t not in phrases]
    return missing
