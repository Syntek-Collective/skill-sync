import { PDFParse } from "pdf-parse"

//Accepts the raw PDF file data and returns the extracted text

export async function textFromPdf(fileBuffer: Buffer): Promise<string> {
    //Create a PDF parser using the PDF file data.
    const parser = new PDFParse({ data: fileBuffer });

    //Ask the parser to read the PDF and extract its text.
    const result = await parser.getText();
    
    //return only the text, with extra whitespace removed from the ends.
    return result.text.trim();
}




