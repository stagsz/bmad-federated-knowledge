# Database Connections and Queries

This document explains how to configure database connections and queries for the BMAD Federated Knowledge System.

## Connection Types

The system supports the following database types:

- `supabase` - Supabase (PostgreSQL-based)
- `postgresql` - PostgreSQL
- `mongodb` - MongoDB
- `mysql` - MySQL
- `oracle` - Oracle (coming soon)
- `sqlserver` - SQL Server (coming soon)
- `sqlite` - SQLite (coming soon)

## Connection String Formats

### Supabase

Supabase uses PostgreSQL under the hood. You can find your connection string in your Supabase project settings under "Database" > "Connection String" > "URI".

Format:
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

Example:
```
postgresql://postgres:your-password@db.abcdefghijklmnop.supabase.co:5432/postgres
```

**Note:** Make sure to:
1. Replace `[YOUR-PASSWORD]` with your actual database password
2. Replace `[PROJECT-REF]` with your Supabase project reference ID
3. Enable connection pooling if needed by using port 6543 instead of 5432

### MongoDB

```
mongodb://[username:password@]host[:port]/database
```

Example:
```
mongodb://myuser:mypassword@localhost:27017/mydb
```

### MySQL

Format 1 (URL):
```
mysql://username:password@hostname:port/database
```

Format 2 (Connection string):
```
host=hostname;port=3306;user=username;password=password;database=mydb
```

### PostgreSQL

```
postgresql://username:password@hostname:port/database
```

## Query Formats

### SQL Databases (MySQL, PostgreSQL, etc.)

Use standard SQL query syntax:
```sql
SELECT * FROM employees WHERE department = 'Engineering'
```

### MongoDB

MongoDB supports two query formats:

1. **SQL-like syntax** (automatically converted to MongoDB query):
   ```sql
   SELECT * FROM employees WHERE department = 'Engineering'
   ```

2. **JSON format** (native MongoDB query):
   ```json
   {
     "collection": "employees", 
     "filter": {
       "department": "Engineering"
     }
   }
   ```

## Examples

### Adding a Supabase Connection

```bash
bmad-fed connection-add supabase-prod -t supabase -s "postgresql://postgres:your-password@db.abcdefghijklmnop.supabase.co:5432/postgres"
```

Or using interactive mode:
```bash
bmad-fed connection-add supabase-prod -i
# Then select 'supabase' from the database type options
# And paste your Supabase connection string when prompted
```

### Adding a MongoDB Connection

```bash
bmad-fed connection-add mongo-dev -t mongodb -s "mongodb://localhost:27017/mydb"
```

### Adding a Database Knowledge Source

```bash
bmad-fed add-knowledge employee_data -t database --connection-ref mongo-dev --query "SELECT * FROM employees"
```

or with JSON query format:

```bash
bmad-fed add-knowledge employee_data -t database --connection-ref mongo-dev --query '{"collection":"employees","filter":{}}'
```

### Syncing Database Knowledge

```bash
bmad-fed sync-db employee_data
```

### Complete Supabase Example

Here's a complete example of setting up and syncing a Supabase knowledge source:

```bash
# 1. Add Supabase connection
bmad-fed connection-add my-supabase -t supabase -s "postgresql://postgres:your-password@db.xyz.supabase.co:5432/postgres"

# 2. Add a knowledge source that queries a Supabase table
bmad-fed add-knowledge user_profiles -t database --connection-ref my-supabase --query "SELECT * FROM profiles WHERE active = true"

# 3. Sync the knowledge source to PDF
bmad-fed sync-db user_profiles

# 4. The data is now cached at: .bmad-fks-cache/db-knowledge/user_profiles.pdf
```

## Troubleshooting

If you encounter connection issues:

1. Verify that the database is running and accessible
2. Check connection credentials
3. Ensure proper network access (firewalls, VPNs, etc.)
4. For MongoDB, check if authentication is enabled
5. Verify that the required database drivers are installed:
   - MongoDB: `npm install mongodb`
   - MySQL: `npm install mysql2`
   - PostgreSQL: `npm install pg`