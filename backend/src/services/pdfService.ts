/*

    What is this service for?
    Extracts the TEXT out of a PDF file. This is the specialist for turning a resume 
    PDF into plain text the AI can read.

    What does it do?
    A controller hands it a PDF (the resume file), and it returns the text inside.
    That's its one job: PDF → text.

    (see services/README for how services work in general)

*/

/*

    TODO
    build out the PDF text extraction.

    This file will need to:
    1. take in a PDF file (the resume)
    2. extract the text from it (using a PDF-parsing library)
    3. return the text

    Coordinate with the team on:
    - which PDF library to use (e.g. pdf-parse)
    - whether it takes the raw file or a filePath (and who fetches it from storage - 
      probably supabaseService does that first)

*/