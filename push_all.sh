#!/bin/bash
echo "Pushing to Work Project..."
cp .clasp-work.json .clasp.json
npx clasp push
echo "Pushing to Private Project..."
cp .clasp-private.json .clasp.json
npx clasp push
echo "Restoring Work Project as default..."
cp .clasp-work.json .clasp.json
echo "Done!"
