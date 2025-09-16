## Optional Dependencies

### PDFKit for Database Sync
The `sync-db` command uses PDFKit to generate PDF files from database queries. This is an optional dependency.

If you plan to use the database sync feature with PDF output, install PDFKit:

```bash
npm install pdfkit
```

You can also use the `--json` option to output as JSON instead of PDF:

```bash
bmad-fed sync-db employee_info --json
```

See [PDFKit Installation Guide](./docs/pdfkit-installation.md) for more details.