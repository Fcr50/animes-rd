const { mdToPdf } = require('md-to-pdf');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'architecture-description.md');
const tmp = path.join(__dirname, '_tmp_presentation.md');
const css = path.join(__dirname, 'pdf-style.css');

let md = fs.readFileSync(src, 'utf8');

// Substitui checkboxes marcados por ✓ verde com HTML inline
md = md.replace(/^(\s*)- \[x\] (.+)$/gm, (_, indent, text) =>
  `${indent}- <span style="color:#2e7d32;font-weight:600;">✓&nbsp;&nbsp;${text}</span>`
);

// Substitui checkboxes desmarcados por ✗ vermelho
md = md.replace(/^(\s*)- \[ \] (.+)$/gm, (_, indent, text) =>
  `${indent}- <span style="color:#c62828;">✗&nbsp;&nbsp;${text}</span>`
);

fs.writeFileSync(tmp, md, 'utf8');

(async () => {
  await mdToPdf(
    { path: tmp },
    {
      stylesheet: [css],
      pdf_options: {
        format: 'A4',
        margin: { top: '22mm', bottom: '22mm', left: '20mm', right: '20mm' },
        printBackground: true,
      },
      dest: path.join(__dirname, 'architecture-description.pdf'),
    }
  );
  fs.unlinkSync(tmp);
  console.log('PDF gerado com sucesso.');
})();
