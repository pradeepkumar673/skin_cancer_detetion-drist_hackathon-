#!/usr/bin/env bash
# Fails if placeholder, mock or unfinished-code markers, or hardcoded secrets, are found in source files.
cd "$(dirname "$0")/.." || exit 2

INCLUDES=(--include=*.js --include=*.mjs --include=*.ts --include=*.tsx --include=*.jsx --include=*.py --include=*.yaml --include=*.yml --include=*.json --include=*.css --include=*.html --include=*.sh)
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.venv --exclude-dir=__pycache__ --exclude-dir=data --exclude-dir=storage --exclude-dir=models --exclude-dir=coverage --exclude-dir=playwright-report --exclude-dir=tests --exclude-dir=e2e --exclude=package-lock.json --exclude=scan_placeholders.sh --exclude=check_copy.py)
MARKERS='TODO|FIXME|XXX|HACK|lorem ipsum|dummy|mock|fake|placeholder|sample data|hardcoded|changeme|your_api_key|your-api-key|NotImplemented|coming soon'
SECRETS='rzp_(test|live)_[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|mongodb(\+srv)?://[^[:space:]"$]+:[^[:space:]"$@]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|hf_[A-Za-z0-9]{30,}'
fail=0

echo "== Placeholder and unfinished-code markers =="
out=$(grep -rIniE "$MARKERS" "${INCLUDES[@]}" "${EXCLUDES[@]}" . | grep -vE 'placeholder[=:-]|::placeholder')
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "none found"; fi

echo "== Hardcoded secrets =="
out=$(grep -rIniE "$SECRETS" "${INCLUDES[@]}" "${EXCLUDES[@]}" .)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "none found"; fi

echo "== Committed env files =="
out=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$')
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "none found"; fi

exit $fail
