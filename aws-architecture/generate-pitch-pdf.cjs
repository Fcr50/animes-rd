const { mdToPdf } = require('md-to-pdf');
const path = require('path');

(async () => {
  await mdToPdf(
    { path: path.join(__dirname, 'ANIMES_RD_Product_Pitch_Crunchyroll.md') },
    {
      stylesheet: [path.join(__dirname, 'pdf-style.css')],
      pdf_options: {
        format: 'A4',
        margin: { top: '22mm', bottom: '22mm', left: '20mm', right: '20mm' },
        printBackground: true,
      },
      dest: path.join(__dirname, 'ANIMES_RD_Product_Pitch_Crunchyroll.pdf'),
    }
  );
  console.log('PDF gerado: ANIMES_RD_Product_Pitch_Crunchyroll.pdf');
})();
