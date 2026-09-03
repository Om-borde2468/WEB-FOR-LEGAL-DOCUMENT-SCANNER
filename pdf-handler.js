// ─────────────────────────────────────────────────────────────
//  PDF Handler  –  uses PDF.js from CDN
// ─────────────────────────────────────────────────────────────

async function extractTextFromPDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => item.str).join(" ");
          fullText += pageText + "\n\n";
        }
        resolve({ text: fullText.trim(), numPages: pdf.numPages });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function validatePDFFile(file) {
  if (!file) return "No file selected.";
  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    return "Only PDF files are supported.";
  }
  if (file.size > 20 * 1024 * 1024) {
    return "File size must be under 20 MB.";
  }
  return null;
}
