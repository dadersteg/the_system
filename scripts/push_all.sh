#!/bin/bash
echo "Pushing to Work Project..."
cp .clasp-work.json .clasp.json
npx clasp push --force
echo "Pushing to Private Project..."
cp .clasp-private.json .clasp.json
npx clasp push --force
echo "Restoring Private Project as default..."
cp .clasp-private.json .clasp.json
echo "Done!"
