"""
Generates the official test PDF:
'MSP for Rabi Crops for Marketing Season 2027-28.pdf'
Matches Press Information Bureau (PIB) official release structure.
"""

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_rabi_2027_28_pdf(output_path: str):
    doc = SimpleDocTemplate(output_path, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    story = []
    styles = getSampleStyleSheet()

    header_style = ParagraphStyle(
        'PIBHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        alignment=1, # Center
        textColor=colors.HexColor('#1a365d')
    )

    date_style = ParagraphStyle(
        'PIBDate',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        alignment=1,
        textColor=colors.HexColor('#4a5568')
    )

    body_style = ParagraphStyle(
        'PIBBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#2d3748')
    )

    # Document Header
    story.append(Paragraph("PRESS INFORMATION BUREAU<br/>GOVERNMENT OF INDIA", header_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Cabinet approves Minimum Support Prices (MSP) for Rabi Crops for Marketing Season 2027-28</b>", header_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Posted On: 30 SEP 2026 3:19PM by PIB Delhi", date_style))
    story.append(Spacer(1, 14))

    story.append(Paragraph(
        "The Cabinet Committee on Economic Affairs (CCEA) chaired by the Prime Minister has approved "
        "the increase in the Minimum Support Prices (MSP) for all mandated Rabi crops for Marketing Season 2027-28. "
        "Government has increased the MSP of Rabi crops for Marketing Season 2027-28 to ensure remunerative prices to the growers for their produce.",
        body_style
    ))
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Minimum Support Prices for all Rabi Crops for Marketing Season 2027-28:</b>", body_style))
    story.append(Spacer(1, 8))

    # Table matching official notification with split header and previous season column
    table_data = [
        [
            "Crops",
            "MSP\nRMS 2026-27\n(Rs./quintal)",
            "Cost* of\nproduction\nRMS 2027-28",
            "MSP\nRMS 2027-28\n(Rs./quintal)",
            "Increase in\nMSP (Absolute)",
            "Margin over\ncost (in %)"
        ],
        ["Wheat", "2425", "1264", "2610", "185", "106%"],
        ["Barley", "1980", "1258", "2286", "306", "82%"],
        ["Gram", "5650", "3672", "5958", "308", "62%"],
        ["Lentil\n(Masur)", "6700", "3824", "7390", "690", "93%"],
        ["Rapeseed &\nMustard", "5950", "3345", "6613", "663", "98%"],
        ["Safflower", "6540", "4810", "7215", "675", "50%"]
    ]

    t = Table(table_data, colWidths=[120, 80, 85, 85, 80, 85])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf2f7')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1a202c')),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ]))
    story.append(t)

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "<i>*Refers to comprehensive cost including all paid out costs such as those incurred on account of hired human labour, bullock labour/machine labour, rent paid for leased in land, expenses incurred on use of material inputs like seeds, fertilizers, manures, irrigation charges, depreciation on implements and farm buildings, interest on working capital, diesel/electricity for operation of pump sets etc, miscellaneous expenses and imputed value of family labour.</i>",
        ParagraphStyle('Footnote', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8, leading=10, textColor=colors.HexColor('#718096'))
    ))

    doc.build(story)
    print(f"Generated test PDF: {output_path}")

if __name__ == "__main__":
    import os
    target_dir = os.path.dirname(os.path.abspath(__file__))
    output_pdf = os.path.join(target_dir, "MSP for Rabi Crops for Marketing Season 2027-28.pdf")
    generate_rabi_2027_28_pdf(output_pdf)
