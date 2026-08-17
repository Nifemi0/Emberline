from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "emberline-whitepaper.pdf"
LOGO = ROOT / "submission-assets" / "emberline-buidl-logo.png"

INK = colors.HexColor("#173126")
INK_2 = colors.HexColor("#294738")
ORANGE = colors.HexColor("#E77B54")
GREEN = colors.HexColor("#4B9B68")
MINT = colors.HexColor("#E8F1E7")
CREAM = colors.HexColor("#F6F2E8")
MUTED = colors.HexColor("#66786D")
LINE = colors.HexColor("#D4DED3")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverKicker", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=9, leading=12, textColor=ORANGE, spaceAfter=18,
))
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=36, leading=40, textColor=CREAM, alignment=TA_LEFT, spaceAfter=13,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["Normal"], fontName="Helvetica",
    fontSize=14, leading=21, textColor=colors.HexColor("#CFE1D3"), spaceAfter=20,
))
styles.add(ParagraphStyle(
    name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=21, leading=25, textColor=INK, spaceBefore=2, spaceAfter=11,
))
styles.add(ParagraphStyle(
    name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=13, leading=17, textColor=INK_2, spaceBefore=10, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="Bodyx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=10.1, leading=15.2, textColor=INK_2, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Smallx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.4, leading=11.5, textColor=MUTED, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="Labelx", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8, leading=10, textColor=GREEN, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="Quote", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=15, leading=21, textColor=INK, leftIndent=16,
    spaceBefore=7, spaceAfter=15,
))
styles.add(ParagraphStyle(
    name="Linkx", parent=styles["Smallx"], textColor=colors.HexColor("#26714A"),
))
styles.add(ParagraphStyle(
    name="CenterSmall", parent=styles["Smallx"], alignment=TA_CENTER,
))


def para(text, style):
    return Paragraph(text, style)


def link(label, url):
    return f'<link href="{url}" color="#26714A">{label}</link>'


class WhitepaperDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=letter,
            leftMargin=0.68 * inch,
            rightMargin=0.68 * inch,
            topMargin=0.62 * inch,
            bottomMargin=0.6 * inch,
            title="Emberline whitepaper",
            author="Emberline",
        )
        frame = Frame(
            self.leftMargin, self.bottomMargin, self.width, self.height,
            id="normal", leftPadding=0, rightPadding=0, topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([
            PageTemplate(id="whitepaper", frames=[frame], onPage=draw_page),
        ])


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
        canvas.drawString(doc.leftMargin, 0.37 * inch, "EMBERLINE / TECHNICAL WHITEPAPER / RWA")
    else:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(doc.leftMargin, letter[1] - 0.38 * inch, letter[0] - doc.rightMargin, letter[1] - 0.38 * inch)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.drawString(doc.leftMargin, letter[1] - 0.27 * inch, "EMBERLINE WHITEPAPER")
        canvas.drawRightString(letter[0] - doc.rightMargin, letter[1] - 0.27 * inch, f"{doc.page:02d}")
    canvas.restoreState()


def heading(number, title):
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
    story += [Spacer(1, 0.78 * inch)]
    if LOGO.exists():
        story += [Image(str(LOGO), width=0.82 * inch, height=0.82 * inch), Spacer(1, 0.22 * inch)]
    story += [para("TECHNICAL WHITEPAPER / BUIDL CTC 2026 FALL", styles["CoverKicker"])]
    story += [para("Emberline", styles["CoverTitle"])]
    story += [para("Funding moves when verified work moves.", styles["CoverSub"])]
    story += [Spacer(1, 0.15 * inch), para("Private evidence. Independent review. Verifiable release.", styles["Quote"])]
    story += [Spacer(1, 0.52 * inch)]
    story += [para("Project sector: RWA", styles["Smallx"])]
    story += [para("Network: Creditcoin Testnet / Attestcoin USC", styles["Smallx"])]
    story += [para("Version: August 2026 public testnet MVP", styles["Smallx"])]
    story += [Spacer(1, 0.22 * inch), para("This document describes the product, trust model, Attestcoin integration, public testnet evidence, and current limitations. It does not claim mainnet deployment or production funds.", styles["Smallx"])]
    story += [PageBreak()]

    story += heading("01", "The problem")
    story += [para("Projects that depend on real-world delivery often release funding before the work can be checked independently. Traditional transparency systems create a second problem: proving progress may require publishing sensitive beneficiary, operational, or personal information.", styles["Bodyx"])]
    story += [para("The result is a difficult tradeoff between accountability and privacy. Donors need a reliable release process. Implementers need a fair way to show progress. Reviewers need to decide against one exact piece of evidence. Everyone needs a record of what happened when a milestone is approved, disputed, or released.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Users", styles["Labelx"]), para("Project owners, implementers, independent reviewers, donors, and auditors.", styles["Bodyx"])],
        [para("Core question", styles["Labelx"]), para("Should this tranche be released now, based on the configured policy and the exact evidence revision reviewed?", styles["Bodyx"])],
        [para("Privacy rule", styles["Labelx"]), para("Sensitive evidence stays private. Emberline stores a commitment and the decision trail, not the underlying file.", styles["Bodyx"])],
        [para("Trust boundary", styles["Labelx"]), para("The system proves that the configured approval process occurred against a specific commitment. It does not prove that software alone makes a physical-world claim true.", styles["Bodyx"])],
    ])]
    story += [Spacer(1, 12), para("Design goals", styles["H2x"])]
    story += [bullet("Make milestone funding conditional instead of manual and ambiguous.")]
    story += [bullet("Keep private delivery information out of public transactions.")]
    story += [bullet("Make reviewer decisions independent, attributable, and tied to one evidence revision.")]
    story += [bullet("Make disputes visible and prevent a disputed milestone from releasing funds.")]
    story += [bullet("Give a visitor a safe, repeatable product experience without pretending that synthetic demo records are blockchain transactions.")]
    story += [PageBreak()]

    story += heading("02", "How Emberline works")
    story += [para("Emberline models a project as a sequence of milestones. Each milestone has an amount, an evidence revision, a reviewer policy, and a quorum. The next milestone is not eligible until the earlier policy has been resolved.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("1 / Define", styles["Labelx"]), para("The owner creates a project, sets milestones, and chooses the approval quorum.", styles["Bodyx"])],
        [para("2 / Commit", styles["Labelx"]), para("The implementer hashes a private evidence package locally. The file is not uploaded to Emberline.", styles["Bodyx"])],
        [para("3 / Review", styles["Labelx"]), para("Independent reviewers assess the same evidence revision and approve or reject it.", styles["Bodyx"])],
        [para("4 / Resolve", styles["Labelx"]), para("A rejection freezes the milestone. A corrected evidence revision creates a new review target while preserving history.", styles["Bodyx"])],
        [para("5 / Release", styles["Labelx"]), para("When the required approvals reach quorum and all sequence checks pass, the eligible tranche can be released.", styles["Bodyx"])],
        [para("6 / Audit", styles["Labelx"]), para("The application and chain records expose commitments, decisions, proof references, and release transactions without exposing private files.", styles["Bodyx"])],
    ])]
    story += [Spacer(1, 13), para("Application safeguards", styles["H2x"])]
    story += [bullet("Server-derived role authorization and production credential guards.")]
    story += [bullet("Immutable evidence revision history and duplicate-vote prevention.")]
    story += [bullet("Idempotent writes and transactional funding checks.")]
    story += [bullet("Hash-chained audit events with tamper detection.")]
    story += [bullet("PostgreSQL persistence in the hosted demo, with SQLite as a local fallback.")]
    story += [PageBreak()]

    story += heading("03", "Attestcoin and USC integration")
    story += [para("Emberline uses the Attestcoin Protocol as a verification bridge between a reviewer decision recorded on Ethereum Sepolia and a release policy enforced on Creditcoin Testnet through USC.", styles["Bodyx"])]
    story += [para("The source registry emits the reviewer decision. The destination verifier asks Creditcoin's BlockProver precompile to verify the source receipt and its Merkle and continuity proof. The verifier decodes the proven receipt and accepts only the expected ReviewRecorded event from the configured immutable registry.", styles["Bodyx"])]
    story += [para("The destination project contract then checks the complete binding: reviewer, project, milestone, evidence revision, evidence commitment, and approval or rejection decision. It rejects invalid or replayed proofs, enforces reviewer policy and sequence, and releases only after quorum.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Source chain", styles["Labelx"]), para("Ethereum Sepolia review registry", styles["Bodyx"])],
        [para("Destination chain", styles["Labelx"]), para("Creditcoin Testnet, chain ID 102031", styles["Bodyx"])],
        [para("Verifier", styles["Labelx"]), para("0x525749ab5390166fCEa076D50d5168d1db476cE7", styles["Bodyx"])],
        [para("Project escrow", styles["Labelx"]), para("0xB236da47fe9215E18C729050fEd3f4B77FcBBffE", styles["Bodyx"])],
        [para("Proof policy", styles["Labelx"]), para("Only a matching, successful, non-replayed ReviewRecorded proof can count toward release.", styles["Bodyx"])],
    ])]
    story += [Spacer(1, 13), para("Why the integration matters", styles["H2x"])]
    story += [para("A trusted proof-worker wallet is not allowed to invent a review. The destination contract verifies the source receipt and binds it to the exact application state that the release policy expects. This keeps the sponsor integration narrow, inspectable, and relevant to the core product flow.", styles["Bodyx"])]
    story += [PageBreak()]

    story += heading("04", "Trust boundaries and safety")
    story += [para("Emberline is deliberately explicit about what is real in each environment. This avoids turning a polished demo into a misleading claim about production funds or physical-world truth.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Guided sandbox", styles["Labelx"]), para("A fresh, session-scoped application journey with synthetic project details and no monetary value. It is designed to explain the user flow without a wallet or signup.", styles["Bodyx"])],
        [para("Live testnet sample", styles["Labelx"]), para("A separate public record with real Sepolia source events, Creditcoin proof registrations, Emberline review calls, and a testnet escrow release.", styles["Bodyx"])],
        [para("Production boundary", styles["Labelx"]), para("Production disables local attestations and demo credentials. The current public sample is testnet-only and makes no mainnet claim.", styles["Bodyx"])],
        [para("Evidence boundary", styles["Labelx"]), para("The system preserves commitments and decisions. Sensitive evidence files remain outside the public chain path.", styles["Bodyx"])],
    ])]
    story += [Spacer(1, 12), para("Known limitations", styles["H2x"])]
    story += [bullet("The public guided experience is synthetic and should not be presented as on-chain project data.")]
    story += [bullet("The live sample is testnet evidence, not a mainnet deployment or production financial service.")]
    story += [bullet("Blockscout source verification is not currently claimed; explorer-linked addresses and transactions are provided for independent inspection.")]
    story += [bullet("Human reviewers remain responsible for the underlying real-world evidence and the final hackathon submission.")]
    story += [PageBreak()]

    story += heading("05", "Evidence and current status")
    story += [para("The public deployment exposes a health endpoint and a live-attestation manifest. The manifest reports the verified testnet sample, its two reviewer proofs, the project and verifier addresses, and the release transaction.", styles["Bodyx"])]
    evidence_rows = [
        [para("Artifact", styles["Labelx"]), para("Public reference", styles["Labelx"])],
        [para("Application", styles["Bodyx"]), para(link("emberline.onrender.com", "https://emberline.onrender.com"), styles["Linkx"])],
        [para("Live health", styles["Bodyx"]), para(link("Health endpoint", "https://emberline.onrender.com/health"), styles["Linkx"])],
        [para("Live sample", styles["Bodyx"]), para(link("Attestation manifest", "https://emberline.onrender.com/api/live-attestation"), styles["Linkx"])],
        [para("Repository", styles["Bodyx"]), para(link("GitHub repository", "https://github.com/Nifemi0/Emberline"), styles["Linkx"])],
        [para("Technical evidence", styles["Bodyx"]), para(link("Deployment record", "https://github.com/Nifemi0/Emberline/blob/main/DEPLOYED.md"), styles["Linkx"])],
        [para("Demo", styles["Bodyx"]), para(link("YouTube video", "https://youtu.be/4Q4WkAnyvaY"), styles["Linkx"])],
    ]
    story += [info_table(evidence_rows, [1.65 * inch, 4.9 * inch])]
    story += [Spacer(1, 13), para("Verification status", styles["H2x"])]
    story += [bullet("Node syntax, PostgreSQL adapter, end-to-end flow, public demo flow, production guards, and Attestcoin adapter checks pass.")]
    story += [bullet("Hosted health reports PostgreSQL persistence, USC mode, and integration readiness.")]
    story += [bullet("Live testnet sample reports two approvals and a testnet release.")]
    story += [bullet("Foundry contract tests require the Foundry toolchain and are not claimed as run in this environment.")]
    story += [PageBreak()]

    story += heading("06", "Submission packet")
    story += [para("Emberline is prepared for human review before submission to BUIDL CTC 2026 Fall. The packet is intentionally separated from the act of submitting: the repository, PDF, video, and testnet evidence are public, while team identity, eligibility, final review, and the final form action remain human-owned.", styles["Bodyx"])]
    story += [Spacer(1, 8), info_table([
        [para("Project", styles["Labelx"]), para("Emberline", styles["Bodyx"])],
        [para("Sector", styles["Labelx"]), para("RWA", styles["Bodyx"])],
        [para("Repository", styles["Labelx"]), para(link("GitHub", "https://github.com/Nifemi0/Emberline"), styles["Linkx"])],
        [para("Whitepaper", styles["Labelx"]), para("This document", styles["Bodyx"])],
        [para("Demo video", styles["Labelx"]), para(link("YouTube", "https://youtu.be/4Q4WkAnyvaY"), styles["Linkx"])],
        [para("Official route", styles["Labelx"]), para(link("DoraHacks Fall page", "https://dorahacks.io/hackathon/buidl-ctc-2026-fall"), styles["Linkx"])],
    ])]
    story += [Spacer(1, 13), para("Before clicking submit", styles["H2x"])]
    story += [bullet("Confirm the final video playback and the exact DoraHacks cutoff timezone.")]
    story += [bullet("Enter truthful team identity, contact, residence, citizenship, role, and eligibility information.")]
    story += [bullet("Select one track only. RWA is the recommended sector for Emberline.")]
    story += [bullet("Keep the sandbox and live testnet sample clearly separated in the form and presentation.")]
    story += [Spacer(1, 20), para("Prepared for review - not submitted", styles["Quote"])]
    story += [para("The official Creditcoin page lists September 6, 2026 as the submission date. Confirm the exact platform cutoff and timezone immediately before submission.", styles["Smallx"])]
    story += [Spacer(1, 12), para(link("Creditcoin BUIDL CTC 2026 Fall", "https://buidl.creditcoin.org/"), styles["Linkx"])]
    return story


OUT.parent.mkdir(parents=True, exist_ok=True)
doc = WhitepaperDocTemplate(str(OUT))
doc.build(build_story())
print(OUT)
