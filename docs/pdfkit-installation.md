# Installing PDFKit

This command uses PDFKit to generate PDF files from database queries. If you receive an error about a missing PDFKit module, you can install it using one of the following methods:

## Inside your project directory:

```bash
npm install pdfkit
```

or if you're using Yarn:

```bash
yarn add pdfkit
```

## For global installation:

```bash
npm install -g pdfkit
```

## Alternative: Use JSON output

If you prefer not to install PDFKit or are having issues installing it, you can use the `--json` option to save the database query results as JSON instead:

```bash
bmad-fed sync-db employee_info --json
```

This will create a JSON file in the cache directory instead of a PDF.