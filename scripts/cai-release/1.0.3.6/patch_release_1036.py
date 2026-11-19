#!/usr/bin/env python3
"""Release 1.0.3.6 (finding F-UX-1): AI-extracted text is never presented as a verified or verbatim quotation.

  python3 -I patch_release_1036.py <1.0.3.5 release dir> <out dir>

Input is the output of scripts/cai-release/1.0.3.5/patch_release_1035.py (the 1.0.3.5 state of CAI-LAB). The change is
wording only: every replacement below is an exact string with the number of times it must occur, so a changed input
fails instead of silently patching something else. No action, condition, expression structure or data field changes.

Why: in the 19 Nov 2026 tenant test the review card for SYN-N09 showed Schedule 2 as "90 (90) months" under the heading
"Evidence (verbatim quotes)". The PDF's text layer says "six (6) months" (4.5-point text in light grey, RGB 0.62). The
extraction model misread it the same way in all three extractions of that document (10, 11 and 19 Nov). The excerpts are
the model's reading of the page, not text copied from the document, so the product must say so wherever it shows them.
"""
import copy
import json
import sys
from pathlib import Path

GATE = 'ReviewgateTeams-B3C964D1-A7D7-F111-84E8-E4FADE0D927F'
EFF = 'Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F'
TERMS = 'Compute-Geteffectiveterms-4DCE77CB-F9D9-F111-84E8-000D3A832B24'
UNCHANGED = ['Extractcontractonupload-4CA9DEF0-7ED7-F111-84E8-E4FADE0D927F',
             'Compute-Noticedeadlines-7F4045FE-F8D9-F111-84E8-000D3A832B24']

# (old, new, expected occurrences in the flow definition). WDL single-quoted literals: no apostrophes in new text.
FLOW_RULES = {
    GATE: [
        ('"text":"Extracted by CAI Contract Intelligence. Check the values against the quoted evidence, then decide."',
         '"text":"Extracted by AI (CAI Contract Intelligence) and NOT VERIFIED against the document. The values and excerpts '
         'below are the reading of the AI and can be wrong, also inside quotation marks. Open the original document and check '
         'each value there before you decide."', 1),
        ('"text":"Evidence (verbatim quotes)"',
         '"text":"AI-extracted excerpts (unverified - compare them with the original document)"', 1),
        ('{"title":"Approve - the values match the evidence","value":"Approved"}',
         '{"title":"Approve - I checked these values in the original document","value":"Approved"}', 1),
        ('"text":"**Notice wording**: _',
         '"text":"**Notice wording (AI-extracted, unverified)**: _', 1),
        ('"text":"**Notice clauses found in the whole document** (more than one period = check which applies): ',
         '"text":"**Notice clauses the AI found in the document** (unverified; more than one period = check which applies): ', 1),
        ('"text":"**Unusual clauses** (check against the values above): ',
         '"text":"**Unusual clauses the AI reported** (unverified; check them in the document): ', 1),
        ('The extracted values and their evidence are kept',
         'The AI-extracted values and excerpts are kept', 1),
        ('The original extraction and its evidence are never modified.',
         'The original AI extraction and its excerpts are never modified.', 1),
    ],
    EFF: [
        ("Contract wording: \"", "Notice wording as extracted by AI (unverified): \"", 4),
        ("the document contains conflicting renewal or notice provisions: ",
         "the AI extraction found conflicting renewal or notice provisions (unverified excerpts): ", 1),
        ("the document states different notice periods (", "the AI extraction read different notice periods (", 2),
        ("no notice period was found in the document", "the AI extraction found no notice period in the document", 1),
        ("no renewal clause was found in the document", "the AI extraction found no renewal clause in the document", 1),
    ],
    TERMS: [
        ("shown with the contract wording and the calculation basis",
         "shown with the notice wording as extracted by AI (unverified, not a verified quotation) and the calculation basis", 1),
    ],
}

GPT_RULES = [
    ("the contract wording (notice_wording)",
     "the notice wording as extracted by AI (notice_wording; say it is AI-extracted text held in the register, not a verified quotation)", 1),
    ("Quote the stored quote briefly where useful.",
     "You may repeat a stored excerpt briefly, but say that it is the AI-extracted excerpt held in the register, not a verified "
     "quotation of the document, and never call it verbatim; for the exact wording the user must check the original document.", 1),
]
TOPIC_TERMS_RULES = [
    ("with per-field source document, location and quote.",
     "with per-field source document, location and the excerpt as extracted by AI (unverified).", 1),
]


def apply(text, rules, label):
    for old, new, n in rules:
        found = text.count(old)
        assert found == n, f'{label}: expected {n} x {old[:70]!r}, found {found}'
        text = text.replace(old, new)
    return text


def patch_strings(obj, rules, label, counts):
    """Apply the rules to every string in the JSON object; returns the patched copy and accumulates counts."""
    if isinstance(obj, dict):
        return {k: patch_strings(v, rules, label, counts) for k, v in obj.items()}
    if isinstance(obj, list):
        return [patch_strings(v, rules, label, counts) for v in obj]
    if isinstance(obj, str):
        for old, new, _ in rules:
            c = obj.count(old)
            if c:
                counts[old] = counts.get(old, 0) + c
                obj = obj.replace(old, new)
        return obj
    return obj


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for stem, rules in FLOW_RULES.items():
        cd = json.loads((src / f'{stem}.clientdata.json').read_text(encoding='utf-8'))
        counts = {}
        cd['properties']['definition'] = patch_strings(copy.deepcopy(cd['properties']['definition']), rules, stem, counts)
        for old, _, n in rules:
            assert counts.get(old, 0) == n, f'{stem}: expected {n} x {old[:70]!r}, found {counts.get(old, 0)}'
        (out / f'{stem}.clientdata.json').write_text(json.dumps(cd, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        (out / f'{stem}.definition.json').write_text(json.dumps(cd['properties']['definition'], ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for stem in UNCHANGED:
        for ext in ('clientdata.json', 'definition.json'):
            (out / f'{stem}.{ext}').write_text((src / f'{stem}.{ext}').read_text(encoding='utf-8'), encoding='utf-8')
    (out / 'gpt.default.yaml').write_text(apply((src / 'gpt.default.yaml').read_text(encoding='utf-8'), GPT_RULES, 'gpt'), encoding='utf-8')
    (out / 'topic.T7GetEffectiveTerms.yaml').write_text(
        apply((src / 'topic.T7GetEffectiveTerms.yaml').read_text(encoding='utf-8'), TOPIC_TERMS_RULES, 'topic'), encoding='utf-8')
    (out / 'topic.T7NoticeDeadlines.yaml').write_text((src / 'topic.T7NoticeDeadlines.yaml').read_text(encoding='utf-8'), encoding='utf-8')
    print(f'wrote {out}')


if __name__ == '__main__':
    main()
