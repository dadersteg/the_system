#!/bin/bash
echo "Deploying to Private Project..."
cp .clasp-private.json .clasp.json
clasp push

echo "Deploying to PMT Project..."
cp .clasp-work.json .clasp.json
clasp push

echo "Restoring to Private Project..."
cp .clasp-private.json .clasp.json
