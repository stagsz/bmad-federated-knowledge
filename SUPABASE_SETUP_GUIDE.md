# Supabase Setup Guide for BMAD-FKS

This guide will help you set up Supabase tables and integrate them with BMAD Federated Knowledge System.

## Step 0: Setup Environment Variables (Recommended)

For security, store your database password in a `.env` file:

1. A `.env` file has been created for you
2. Get your database password:
   - Go to Supabase Dashboard → **Settings** → **Database**
   - Click **"Reset database password"** if needed
   - Copy the password
3. Open the `.env` file and replace `PASTE_YOUR_PASSWORD_HERE` with your actual password
4. Save the file

**Note**: The `.env` file is already in `.gitignore` and won't be committed to version control.

## Step 1: Create Tables in Supabase

1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/jesjoxkhqnxjpeesxajv
2. Go to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Open the file `supabase-setup.sql` from this directory
5. Copy and paste the SQL content into the Supabase SQL Editor
6. Click **Run** to execute the SQL
7. Verify the tables were created by going to **Database** → **Tables**

## Step 2: Add/Update Supabase Connection

Make sure your connection uses the correct password from the `.env` file:

```bash
# If you already have a connection, remove it first
npx bmad-fed connection-remove my-supabase -f

# Add connection with correct password (get password from .env file)
npx bmad-fed connection-add my-supabase -t supabase -s "postgresql://postgres:YOUR_PASSWORD@db.jesjoxkhqnxjpeesxajv.supabase.co:5432/postgres"
```

**Replace `YOUR_PASSWORD`** with the password from your `.env` file (the value of `SUPABASE_DB_PASSWORD`).

### Verify Connection

```bash
npx bmad-fed connection-list
```

You should see your `my-supabase` connection listed.

## Step 3: Add Knowledge Sources

After creating the tables, run these commands in your terminal:

### Add User Profiles Knowledge Source

```bash
npx bmad-fed add-knowledge user_profiles -t database --connection-ref my-supabase --query "SELECT * FROM profiles WHERE active = true"
```

### Add Knowledge Items Source

```bash
npx bmad-fed add-knowledge knowledge_base -t database --connection-ref my-supabase --query "SELECT * FROM knowledge_items"
```

### Add All Profiles (including inactive)

```bash
npx bmad-fed add-knowledge all_profiles -t database --connection-ref my-supabase --query "SELECT * FROM profiles ORDER BY created_at DESC"
```

## Step 4: Sync Database Knowledge

Sync individual knowledge sources:

```bash
# Sync user profiles to PDF
npx bmad-fed sync-db user_profiles

# Sync knowledge base to PDF
npx bmad-fed sync-db knowledge_base

# Sync all database sources at once
npx bmad-fed sync-db --all
```

### Alternative: Sync to JSON

If you prefer JSON format instead of PDF:

```bash
npx bmad-fed sync-db user_profiles --json
npx bmad-fed sync-db knowledge_base --json
```

## Step 5: Build Complete Context

Build the complete context including all knowledge sources:

```bash
npx bmad-fed build-context
```

This will:
- Sync all Git repositories
- Sync all database knowledge sources
- Sync all web page sources
- Flatten repositories into XML
- Generate a `context.md` file mapping all sources

## Cached Files Location

After syncing, your knowledge will be cached at:

- **Database knowledge**: `.bmad-fks-cache/db-knowledge/user_profiles.pdf`
- **Database knowledge (JSON)**: `.bmad-fks-cache/db-knowledge/user_profiles.json`
- **Repository knowledge**: `.bmad-fks-cache/[repo-name].xml`
- **Web sources**: `.bmad-fks-cache/[source-name].pdf`

## Verify Everything Works

```bash
# List all connections
npx bmad-fed connection-list

# Check system status
npx bmad-fed status

# List all repositories and knowledge sources
npx bmad-fed list
```

## Custom Queries

You can create knowledge sources with custom SQL queries:

```bash
# Only admin users
npx bmad-fed add-knowledge admin_profiles -t database --connection-ref my-supabase --query "SELECT username, full_name, email, role FROM profiles WHERE active = true AND role = 'admin'"

# Recent knowledge items
npx bmad-fed add-knowledge recent_knowledge -t database --connection-ref my-supabase --query "SELECT * FROM knowledge_items WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC"

# Knowledge by category
npx bmad-fed add-knowledge guides -t database --connection-ref my-supabase --query "SELECT * FROM knowledge_items WHERE category = 'guides'"
```

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Verify your database password is correct
2. Check if your IP is allowed in Supabase (Settings → Database → Network Restrictions)
3. Test the connection:
   ```bash
   npx bmad-fed connection-list
   ```

### No Data Synced

If sync produces empty results:

1. Verify the table exists in Supabase
2. Check that the table has data:
   - Go to Supabase Dashboard → Database → Tables
   - Click on the table name
3. Test your query in Supabase SQL Editor first

### PDF Generation Issues

If you get PDFKit errors:

1. Install PDFKit:
   ```bash
   npm install pdfkit
   ```
2. Or use JSON format instead:
   ```bash
   npx bmad-fed sync-db user_profiles --json
   ```

### Password Authentication Failed

If you see "password authentication failed":

1. **Reset your password** in Supabase:
   - Go to Settings → Database → Reset database password
   - Copy the new password
2. **Update `.env` file**:
   - Open `.env` file
   - Replace the `SUPABASE_DB_PASSWORD` value with your new password
3. **Update the connection**:
   ```bash
   npx bmad-fed connection-remove my-supabase -f
   npx bmad-fed connection-add my-supabase -t supabase -s "postgresql://postgres:YOUR_NEW_PASSWORD@db.jesjoxkhqnxjpeesxajv.supabase.co:5432/postgres"
   ```

## Security Best Practices

### Environment Variables

✅ **DO:**
- Store passwords in `.env` file
- Keep `.env` file out of version control (already in `.gitignore`)
- Use different passwords for development and production

❌ **DON'T:**
- Commit `.env` file to Git
- Share your `.env` file
- Use the same password across multiple projects

### Database Access

- Use **Row Level Security (RLS)** in Supabase for production data
- Limit database access by IP address if possible (Supabase Settings → Database → Network Restrictions)
- Create read-only database users for knowledge syncing
- Regularly rotate database passwords

### Cached Data

The cached knowledge files (`.bmad-fks-cache/`) may contain sensitive data:
- Add `.bmad-fks-cache/` to `.gitignore` (already done)
- Review cached PDFs/JSON before sharing
- Clean cache regularly: `npx bmad-fed clean`

## Next Steps

- Add more tables to your Supabase database
- Create custom queries for specific knowledge needs
- Schedule regular syncs using the sync policies
- Use the cached knowledge in your AI workflows

## Support

For more information:
- BMAD-FKS Documentation: See `README.md`
- Database Connections: See `docs/database-connections.md`
- Supabase Documentation: https://supabase.com/docs
