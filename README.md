# vcf-viewer

Variant Call Format viewer with colored bases and metadata

## Features

- Colored REF/ALT base display (A=green, T=red, G=gold, C=blue)
- VCF header metadata parsing (INFO, FORMAT, FILTER fields)
- Variant type classification (SNP, INDEL, MNP)
- Chromosome and position display
- QUAL score column
- Text search across all fields
- Pagination for large files (100 variants per page)

## Supported Extensions

- `.vcf`

## Installation

Install from the **Plugins** tab in the AutoPipe desktop app.

## Development

1. Copy the plugin to your local plugins directory
2. Run `show_results` in AutoPipe to test
3. Edit `index.js` and refresh the viewer to see changes
