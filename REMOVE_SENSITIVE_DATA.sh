#!/bin/bash
# Script to remove sensitive Redis URL from git history

echo "⚠️  WARNING: This will rewrite git history!"
echo "This will remove the Redis password from all commits in history."
echo ""
echo "Before proceeding:"
echo "1. Make sure you have a backup"
echo "2. Make sure no one else is working on this branch"
echo "3. After running this, you'll need to force push: git push --force"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 1
fi

# Method 1: Use git filter-branch (built-in, but slower)
echo "Removing sensitive data from git history..."

# Remove the Redis URL from the file in all commits
git filter-branch --force --index-filter \
  "git checkout-index -f -a && \
   if [ -f GOOGLE_OAUTH_SETUP.md ]; then
     sed -i '' 's|REDIS_URL=redis://default:Rc5fD2qxopo3uVlRT3M4lhSxvYl5U8fL@redis-15374.c338.eu-west-2-1.ec2.cloud.redislabs.com:15374|REDIS_URL=redis://default:password@host:port|g' GOOGLE_OAUTH_SETUP.md
   fi" \
  --prune-empty --tag-name-filter cat -- --all

echo ""
echo "✅ Done! Now you need to:"
echo "1. Force push to remote: git push --force origin main"
echo "2. If others have cloned, they need to re-clone"
echo "3. Rotate your Redis password immediately!"
