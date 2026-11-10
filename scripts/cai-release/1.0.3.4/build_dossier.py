#!/usr/bin/env python3
"""Product dossier for CAI-L4-CI-001 release 1.0.3.4 (two A4 pages, reportlab, deterministic output).

  python3 -I build_dossier.py <out.pdf>

Same structure as the 1.0.3.1 dossier; content updated for the corrective release 1.0.3.4.
"""
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIR = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', FONT_DIR + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', FONT_DIR + 'DejaVuSans-Bold.ttf'))

RELEASE = '1.0.3.4'
ORANGE = colors.HexColor('#D4572A')
GREY = colors.HexColor('#5F6368')
LINE = colors.HexColor('#D9D9D9')
HEAD = colors.HexColor('#F2F2F2')

kicker = ParagraphStyle('k', fontName='DVB', fontSize=7.5, textColor=ORANGE, leading=10)
title = ParagraphStyle('t', fontName='DVB', fontSize=21, leading=25, spaceAfter=2)
sub = ParagraphStyle('s', fontName='DV', fontSize=9.5, textColor=GREY, leading=12.5, spaceAfter=8)
h2 = ParagraphStyle('h2', fontName='DVB', fontSize=11.5, leading=14, spaceBefore=6, spaceAfter=3)
body = ParagraphStyle('b', fontName='DV', fontSize=8.5, leading=11, alignment=TA_LEFT, spaceAfter=3)
cell = ParagraphStyle('c', fontName='DV', fontSize=7.7, leading=9.7)
cellb = ParagraphStyle('cb', fontName='DVB', fontSize=7.7, leading=9.7)
bullet = ParagraphStyle('bl', parent=body, leftIndent=10, firstLineIndent=-8, spaceAfter=2)
small = ParagraphStyle('sm', fontName='DV', fontSize=7.8, textColor=GREY, leading=10)


def table(head, rows, widths=(38 * mm, 132 * mm)):
    data = [[Paragraph(head[0], cellb), Paragraph(head[1], cellb)]] + [[Paragraph(a, cell), Paragraph(b, cell)] for a, b in rows]
    t = Table(data, colWidths=widths, hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), HEAD), ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
                           ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 2), ('LEFTPADDING', (0, 0), (-1, -1), 4)]))
    return t


def bullets(items):
    return [Paragraph('– ' + x, bullet) for x in items]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('DV', 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(20 * mm, 12 * mm, f'ColleagueAI Contract Intelligence & Register · CAI-L4-CI-001 · release {RELEASE} (controlled test release)')
    canvas.drawRightString(190 * mm, 12 * mm, f'p.{doc.page}')
    canvas.restoreState()


story = [
    Paragraph('COLLEAGUEAI · AGENT DOSSIER · CAI SCORE L4 — DECIDE (SUPERVISED)', kicker),
    Paragraph('Contract Intelligence &amp; Register', title),
    Paragraph(f'SKU CAI-L4-CI-001 · Microsoft Copilot Studio managed solution CAIContractIntelligence · '
              f'Release {RELEASE} — controlled test release, not yet released for sale. Corrective release: a notice deadline is shown '
              'only when a reviewer has confirmed it (1.0.3.2 counted notice periods stated in months as days).', sub),
    Paragraph('01 — What it does', h2),
    Paragraph('Extracts the key terms of each contract with a source quote and page reference, routes every extraction to a named '
              'reviewer, and keeps a register of approved terms. Amendments are applied to compute the effective terms, and renewal '
              'and notice deadlines are answered from approved data only. Contract summarisation is one feature of the product, not '
              'the product.', body),
    table(['Capability', f'How it works in release {RELEASE}'], [
        ('Cited extraction', '29 fields per document (parties, term, renewal and notice, fees, payment, liability cap and exclusions, '
         'indemnities, IP, confidentiality, data protection, governing law, precedence, unusual clauses, open questions…), plus the '
         'signing date as a field of its own. Each value carries a quote, a location and a status (found, not found, ambiguous, '
         'conflict resolved).'),
        ('Notice periods as stated', 'The notice period is kept exactly as the contract states it (amount and unit: days, business days, '
         'weeks, months, years), with the verbatim wording, whether it counts back from the term end or the renewal date, and whether '
         'notice is due on or strictly before that date. Every notice clause found anywhere in the document, including schedules and '
         'small print, is listed.'),
        ('Notice deadlines', 'Calendar calculation: months and years on the calendar (month ends, February and leap years included), days '
         'and weeks exactly, shown with the contract wording and the calculation. A deadline is shown only when CONFIRMED: from a '
         'reviewer-approved notice period with nothing left to check. Conflicting, implausible or business-day periods, unclear wording, '
         'a missing renewal or notice clause and converted 1.0.3.2 records give “Deadline not verified — human review required” and no '
         'date, no days left and no reminder, until the reviewer confirms the period on a deadline card in Teams. The calculation is not '
         'a legal interpretation of the clause.'),
        ('Human review in Teams', 'A review card goes to the named reviewer, showing the notice period, its wording, all notice clauses '
         'found and the signing date. Approve, reject or correct. A notice period is applied only when the reviewer ticks an explicit '
         'confirmation; it and an effective date correction are applied at once and recorded with the reviewer’s name, the original value '
         'and evidence kept; any other correction records the review as “Needs correction” and blocks approval until resolved. A deadline '
         'that is not verified sends the reviewer a deadline card with the reasons and candidate calculations. Stale or superseded review '
         'cards are rejected server-side.'),
        ('Register and effective terms', 'Masters and amendments are linked by contract reference; effective terms are recomputed on '
         'approval, on content change and daily. Amendments that take effect later are named with their effective date; an approved '
         'amendment without a matching master is marked as not applied. Records whose correction is unresolved are never used.'),
        ('Deadline and term queries', 'A Copilot Studio agent answers from two deterministic tools (effective terms; notice deadlines over '
         'a horizon), stating the as-of date and business time zone, citing the source document and giving the notice wording, the '
         'calculation with each confirmed deadline, and “Deadline not verified — human review required” instead of a date otherwise.'),
        ('Per-user access', 'The agent reads the register with the signed-in user’s own Microsoft identity. Contracts are owned by Dataverse '
         'owner teams; a user sees only the contracts of the teams they belong to, read-only. Access changes take effect at the next '
         'question.'),
        ('Execution warnings', 'Documents that are not fully signed are flagged on the card, in the register and in answers; approval of '
         'an extraction never means the agreement is in force.'),
    ]),
    Paragraph('02 — Human accountability (why L4)', h2),
    *bullets(['The agent extracts and computes; a named reviewer approves every record before it is used.',
              'Lawyers own interpretation and advice. The product does not give legal advice and does not act on contracts.',
              'Every decision, correction, resolution, deadline confirmation and withdrawn or recalculated deadline is logged with identity and timestamp.']),
    Paragraph('03 — Prerequisites and costs', h2),
    table(['Item', 'Requirement'], [
        ('Microsoft environment', 'Power Platform environment with Dataverse (≈1 GB free database capacity), Microsoft 365 with Teams and SharePoint.'),
        ('Copilot Studio capacity', 'Mandatory. The flows are Copilot Studio agent flows and need prepaid Copilot Credits or a pay-as-you-go '
         'billing plan. Without capacity no flow runs.'),
        ('Microsoft costs', 'Microsoft consumption charges are separate from the ColleagueAI licence and are billed by Microsoft. Our '
         'estimates, their uncertainty and recommended limits are in the installation guide (section 1a); they are not yet reconciled '
         'with Microsoft’s billing. Microsoft’s run records show 72-74 flow actions (about 9.4 Copilot Credits) per recalculation '
         'in release 1.0.3.3; 1.0.3.4 adds about 7.'),
        ('Connections', 'Microsoft Dataverse, SharePoint and Microsoft Teams: three connections, four connection references (the agent has '
         'its own Dataverse reference and reads with each user’s sign-in).'),
        ('Supported documents', 'Text-based PDF contracts in English. Scanned (image-only) PDFs are out of scope.'),
    ]),
    Paragraph('04 — Known limitations of this release', h2),
    *bullets([
        'Notice deadlines are calendar calculations from the notice period as stated, not legal interpretations; at month ends the '
        'earlier reading is used. Any deadline a reviewer has not confirmed is withheld (“Deadline not verified — human review required”).',
        'After an upgrade, deadlines stored by 1.0.3.2 and PROVISIONAL deadlines of 1.0.3.3 are withheld until recalculated; converted '
        'month-based periods then need a reviewer’s confirmation.',
        'Very small or light-coloured print may be misread by the document reader; contradicting notice clauses are listed and withhold '
        'the deadline. A clause the extraction does not find at all, or misreads consistently in number and wording, cannot be detected '
        'automatically: the review is the control. Tested on 15 synthetic notice documents, two manipulated documents and targeted tests.',
        'Approved amendments apply from approval also when they take effect later (the register names them and their effective date).',
        'Access is per owner team, not per contract. In this release all new uploads are assigned to one team, set during installation; '
        'folder-based assignment is on the roadmap.',
        'Per-user access was tested in Teams with a second licensed user (own team’s contracts only, also after a team change); a user '
        'without any team gets no data and a plain no-access message.',
        'Managed import can publish the agent automatically, and an upgrade keeps the previously published agent; the installation guide '
        'makes a post-import check mandatory and asks for a new publish after an upgrade.',
        'The daily recompute runs at 05:30 Central Europe time and its Microsoft consumption grows with the register.',
    ]),
    Paragraph(f'05 — Not included in release {RELEASE} (roadmap)', h2),
    Paragraph('These are planned and are not part of what is sold with this release:', body),
    *bullets(['One-page contract summary document saved to SharePoint.', 'Playbook deviation checks with severity.',
              'Renewal notifications to contract owners (only administrator failure alerts exist today).',
              'Batch import with recovery reporting.', 'Assignment of contracts to different teams by SharePoint folder.',
              'A holiday calendar for business-day notice periods.', 'Czech and German output.',
              'A separate Microsoft 365 Copilot package (the release is a Copilot Studio managed solution).']),
    Paragraph('06 — Data handling', h2),
    Paragraph('Contract documents and extracted data stay in the customer’s Microsoft tenant (SharePoint and Dataverse). Generative AI '
              'processing uses Microsoft services under the customer’s Microsoft agreements; depending on environment settings (“Move '
              'data across regions”), prompts may be processed outside the environment’s region. ColleagueAI processes only separate '
              'governance-layer metadata as described in the Trust Center. Customers should assess whether a DPIA is required for their '
              'contract data.', body),
    Spacer(1, 6),
    Paragraph(f'This dossier describes release {RELEASE} as tested on 10 November 2026. CAI L4 is ColleagueAI’s internal governance '
              'classification, not an EU AI Act risk category. Confidential · for evaluation.', small),
]

out = sys.argv[1]
doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=14 * mm, bottomMargin=18 * mm,
                        title='Contract Intelligence & Register — Agent dossier', author='Colleague AI s.r.o.',
                        subject=f'CAI-L4-CI-001 release {RELEASE}', creator='ColleagueAI dossier build', invariant=1)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('written', out)
