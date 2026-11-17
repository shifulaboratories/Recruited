#!/bin/sh
# Assembles the landing page into _site/: site/ as written, plus the brand
# files it uses, copied from brand/ so there is one copy of each.
set -e
rm -rf _site
cp -r site _site
cp brand/tokens/tokens.css _site/tokens.css
cp brand/logo/favicon.svg _site/favicon.svg
cp brand/github-graphics/social-preview-light.png _site/og.png
