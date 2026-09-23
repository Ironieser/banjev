#!/bin/sh
# Assemble the GitHub Pages site into build/site/ (site page + current data + logo).
set -e
cd "$(dirname "$0")/.."
rm -rf build/site && mkdir -p build/site/data
cp site/index.html build/site/
cp docs/logo.png build/site/logo.png
cp data/papers.json data/authors.json build/site/data/
