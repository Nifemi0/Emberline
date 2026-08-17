from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "emberline-submission-brief.pdf"

INK = colors.HexColor("#173126")
INK_2 = colors.HexColor("#294738")
ORANGE = colors.HexColor("#E77B54")
GREEN = colors.HexColor("#4B9B68")
MINT = colors.HexColor("#E8F1E7")
CREAM = colors.HexColor("#F6F2E8")
MUTED = colors.HexColor("#66786D")
LINE = colors.HexColor("#D4DED3")


def para(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverKicker", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=9, leading=12, textColor=ORANGE, tracking=1.6, spaceAfter=20,
))
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=37, leading=41, textColor=CREAM, alignment=TA_LEFT, spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["Normal"], fontName="Helvetica",
    fontSize=15, leading=22, textColor=colors.HexColor("#CFE1D3"), spaceAfter=24,
))
styles.add(ParagraphStyle(
    name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=22, leading=26, textColor=INK, spaceBefore=2, spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=13, leading=17, textColor=INK_2, spaceBefore=11, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="Bodyx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=10.2, leading=15.5, textColor=INK_2, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Smallx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.5, leading=12, textColor=MUTED, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="Labelx", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8, leading=10, textColor=GREEN, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="Quote", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=15, leading=21, textColor=INK, leftIndent=16, borderColor=ORANGE,
    borderWidth=0, borderPadding=0, spaceBefore=7, spaceAfter=15,
))
styles.add(ParagraphStyle(
    name="Linkx", parent=styles["Smallx"], textColor=colors.HexColor("#26714A"),
))


def link(label, url):
    return f'<link href="{url}" color="#26714A">{label}</link>'


class BriefDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=letter, leftMargin=0.68 * inch,
                         rightMargin=0.68 * inch, topMargin=0.62 * inch,
                         bottomMargin=0.6 * inch, title="Emberline submission brief",
                         author="Emberline")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height,
                      id="normal", leftPadding=0, rightPadding=0, topPadding=0,
                      bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="brief", frames=[frame], onPage=draw_page)])


def draw_page(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(INK)
        canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
        canvas.setFillColor(ORANGE)
        canvas.circle(letter[0] - 58, letter[1] - 58, 21, fill=1, stroke=0)
        canvas.setFillColor(CREAM)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawCentredString(letter[0] - 58, letter[1] - 63, "*")
        canvas.setFillColor(colors.HexColor("#A6C5AD"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(doc.leftMargin, 0.37 * inch, "EMBERLINE / BUIDL CTC 2026 FALL / RWA")
    else:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(doc.leftMargin, letter[1] - 0.38 * inch, letter[0] - doc.rightMargin, letter[1] - 0.38 * inch)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.drawString(doc.leftMargin, letter[1] - 0.27 * inch, "EMBERLINE")
        canvas.drawRightString(letter[0] - doc.rightMargin, letter[1] - 0.27 * inch, f"{doc.page:02d}")
    canvas.restoreState()


def section_heading(number, title):
    return [
        para(f"<font color='#E77B54'>{number}</font>  {title}", styles["H1x"]),
        Spacer(1, 4),
    ]


def bullet(text):
    return para(f"<font color='#E77B54'>+</font>  {text}", styles["Bodyx"])


def info_table(rows, widths=None):
    table = Table(rows, colWidths=widths or [1.65 * inch, 4.9 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (0, -1), GREEN),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ]))
    return table


def build_story():
    story = []
    story += [Spacer(1, 1.1 * inch), para("BUIDL CTC 2026 FALL", styles["CoverKicker"])]
    story += [para("Emberline", styles["CoverTitle"])]
    story += [para("Private evidence. Independent review. Verifiable release.", styles["CoverSub"])]
    story += [Spacer(1, 0.25 * inch), para("Capital moves when verified work moves.", styles["Quote"])]
    story += [Spacer(1, 0.8 * inch)]
    story += [para("Submission brief / public testnet MVP", styles["Smallx"])]
    story += [para("Recommended sector: RWA", styles["Smallx"])]
    story += [PageBreak()]

    story += section_heading("01", "What Emberline does")
    story += [para("Emberline is a milestone-funding and accountability workspace. It keeps sensitive evidence outside the public ledger while making the approval process, evidence commitment, reviewer decision, and capital release inspectable.", styles["Bodyx"])]
    story += [para("A project owner defines sequential milestones and quorum. An implementer hashes a private delivery package locally. Independent reviewers decide against one exact revision. A milestone can release only after the policy is satisfied.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Problem", styles["Labelx"]), para("Funding often moves before delivery is independently verified, while public transparency can expose sensitive beneficiary or operational data.", styles["Bodyx"])],
        [para("Solution", styles["Labelx"]), para("Commit evidence without publishing the file, bind reviewer decisions to the exact revision, freeze disputed work, and release only the eligible tranche.", styles["Bodyx"])],
        [para("Trust boundary", styles["Labelx"]), para("The chain proves that the configured approval process occurred against a specific commitment. It does not claim that blockchain alone proves a real-world event.", styles["Bodyx"])],
        [para("Sector", styles["Labelx"]), para("RWA - off-chain delivery evidence and independent decisions connected to transparent on-chain funding policy.", styles["Bodyx"])],
    ])]
    story += [Spacer(1, 10), para("Core capabilities", styles["H2x"])]
    story += [bullet("Private browser-side SHA-256 evidence hashing; files are not uploaded.")]
    story += [bullet("Immutable evidence revisions with dispute locks and complete history.")]
    story += [bullet("Independent reviewer permissions, duplicate-vote prevention, quorum, and sequential release guards.")]
    story += [bullet("Hash-chained application audit trail with tamper detection.")]
    story += [bullet("Public session-scoped sandbox for the product experience, clearly separated from the live testnet sample.")]
    story += [PageBreak()]

    story += section_heading("02", "Attestcoin Protocol integration")
    story += [para("The Attestcoin Protocol is the verification bridge between a reviewer decision on Ethereum Sepolia and the release policy enforced on Creditcoin testnet.", styles["Bodyx"])]
    story += [para("EmberlineReviewVerifier accepts an official proof only when Creditcoin's BlockProver verifies the source receipt and the receipt contains exactly one ReviewRecorded event from the configured source registry. The decoded event is bound to the reviewer, project, milestone, revision, evidence commitment, and decision. EmberlineProject checks the complete binding and prevents proof replay.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Source chain", styles["Labelx"]), para("Ethereum Sepolia review registry", styles["Bodyx"])],
        [para("Execution chain", styles["Labelx"]), para("Creditcoin testnet, chain ID 102031", styles["Bodyx"])],
        [para("Verifier", styles["Labelx"]), para("0x525749ab5390166fCEa076D50d5168d1db476cE7", styles["Bodyx"])],
        [para("Project escrow", styles["Labelx"]), para("0xB236da47fe9215E18C729050fEd3f4B77FcBBffE", styles["Bodyx"])],
        [para("Live sample", styles["Labelx"]), para("Two approved reviews, 0.01 CTC released, testnet only", styles["Bodyx"])],
    ])]
    story += [Spacer(1, 12), para("Live evidence", styles["H2x"])]
    evidence_rows = [
        [para("Artifact", styles["Labelx"]), para("Public link", styles["Labelx"])],
        [para("Sepolia registry", styles["Bodyx"]), para(link("Explorer", "https://sepolia.etherscan.io/address/0x525749ab5390166fCEa076D50d5168d1db476cE7"), styles["Linkx"])],
        [para("Creditcoin verifier", styles["Bodyx"]), para(link("Explorer", "https://creditcoin-testnet.blockscout.com/address/0x525749ab5390166fCEa076D50d5168d1db476cE7"), styles["Linkx"])],
        [para("Project escrow", styles["Bodyx"]), para(link("Explorer", "https://creditcoin-testnet.blockscout.com/address/0xB236da47fe9215E18C729050fEd3f4B77FcBBffE"), styles["Linkx"])],
        [para("Live JSON manifest", styles["Bodyx"]), para(link("Application endpoint", "https://emberline.onrender.com/api/live-attestation"), styles["Linkx"])],
    ]
    story += [info_table(evidence_rows, [1.65 * inch, 4.9 * inch])]
    story += [Spacer(1, 10), para("The live sample is deliberately scoped to testnet. It is not a claim of mainnet deployment or production funds.", styles["Smallx"])]
    story += [PageBreak()]

    story += section_heading("03", "Experience and submission assets")
    story += [para("The guided workspace gives a visitor a no-wallet path through the product: generate a session-specific evidence commitment, switch between reviewer roles, reach quorum, and record a policy-controlled release. These records are synthetic application records with no monetary value.", styles["Bodyx"])]
    story += [para("The live Attestcoin sample is linked separately so the interactive experience stays safe and repeatable while the cross-chain integration remains independently verifiable.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Application", styles["Labelx"]), para(link("emberline.onrender.com", "https://emberline.onrender.com"), styles["Linkx"])],
        [para("Repository", styles["Labelx"]), para(link("github.com/Nifemi0/Emberline", "https://github.com/Nifemi0/Emberline"), styles["Linkx"])],
        [para("Demo video", styles["Labelx"]), para(link("Emberline motion demo", "https://youtu.be/4Q4WkAnyvaY"), styles["Linkx"])],
        [para("Technical brief", styles["Labelx"]), para(link("This PDF", "https://github.com/Nifemi0/Emberline/blob/main/submission-assets/emberline-submission-brief.pdf"), styles["Linkx"])],
    ])]
    story += [Spacer(1, 13), para("Official submission checklist", styles["H2x"])]
    story += [bullet("Select one official sector: RWA is the recommended fit.")]
    story += [bullet("Provide the GitHub repository with this README and the technical brief PDF.")]
    story += [bullet("Provide the public demo video URL.")]
    story += [bullet("Provide team member name, email, bio, role, residence, and citizenship in the DoraHacks form.")]
    story += [bullet("Confirm original-work, testnet-deployment, Attestcoin integration, and third-party-rights requirements.")]
    story += [Spacer(1, 12), para("Current official pages", styles["H2x"])]
    story += [para(link("Creditcoin BUIDL CTC 2026 Fall", "https://buidl.creditcoin.org/"), styles["Linkx"])]
    story += [para(link("DoraHacks BUIDL CTC 2026 Fall submission", "https://dorahacks.io/hackathon/buidl-ctc-2026-fall"), styles["Linkx"])]
    story += [para("The official Creditcoin page lists September 6, 2026. Confirm the exact DoraHacks cutoff and timezone immediately before submitting.", styles["Smallx"])]
    story += [Spacer(1, 20), para("Emberline / public testnet MVP / prepared for human submission review", styles["Smallx"])]
    return story


OUT.parent.mkdir(parents=True, exist_ok=True)
doc = BriefDocTemplate(str(OUT))
doc.build(build_story())
print(OUT)
