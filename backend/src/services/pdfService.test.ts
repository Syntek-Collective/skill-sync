import { textFromPdf } from "./pdfService"

const mockGetText = jest.fn()

//Replace the real PDF parser with a fake one for testing.
jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
  })),
}));

describe("textFromPDF", () => {
  beforeEach(() => {
    //Reset the fake parser before each test.
    mockGetText.mockReset();
  });

  it("returns text from a PDF", async () => {
    //Pretned the PDF parser found this text.
    mockGetText.mockResolvedValue({
      text: "Jane Doe Software Engineer",
    });

    const fakePdfBuffer = Buffer.from("fake pdf file");

    const result = await textFromPdf(fakePdfBuffer);

    expect(result).toBe("Jane Doe Software Engineer");
  });

  it("removes extra spaces from the beginning and end", async () => {
    //Pretend the PDF parser found text with extra spaces.
    mockGetText.mockResolvedValue({
      text: "   Jane Doe Software Engineer   ",
    });

    const fakePdfBuffer = Buffer.from("fake pdf file");

    const result = await textFromPdf(fakePdfBuffer);

    expect(result).toBe("Jane Doe Software Engineer");
  });
});
