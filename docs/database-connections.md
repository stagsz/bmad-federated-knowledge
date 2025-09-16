# Database Connections and Queries

This document explains how to configure database connections and queries for the BMAD Federated Knowledge System.

## Connection Types

The system supports the following database types:

- `mongodb` - MongoDB
- `mysql` - MySQL
- `postgresql` - PostgreSQL
- `oracle` - Oracle (coming soon)
- `sqlserver` - SQL Server (coming soon)
- `sqlite` - SQLite (coming soon)

## Connection String Formats

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