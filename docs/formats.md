# Shared formats (single source of truth)

If you change anything here, tell the other two people.

## 1. Tracker report (client -> observer)
POST {OBSERVER_URL}/reports

    {
      "client": "web",
      "version": "1",
      "strict": false,
      "reads": [
        { "endpoint": "GET /users/:id", "path": "user_name" },
        { "endpoint": "GET /users/:id", "path": "orders[].total" }
      ]
    }

## 2. Usage map (observer -> Action)
GET {OBSERVER_URL}/usage

    {
      "GET /users/:id": {
        "user_name": [ { "client": "web", "version": "1", "strict": false } ],
        "email": [
          { "client": "web", "version": "1", "strict": false },
          { "client": "web", "version": "2", "strict": false }
        ]
      }
    }

## 3. Response shape (flattened)

    {
      "GET /users/:id": {
        "user_name": "string",
        "address.city": "string",
        "orders[].total": "number"
      }
    }

## 4. Check result (classifier output)
changeType: removed | retyped | added | enum_changed
verdict: breaking | warn | safe
A rename is treated as removed + added.

    [
      {
        "endpoint": "GET /users/:id",
        "path": "user_name",
        "changeType": "removed",
        "verdict": "breaking",
        "affectedClients": ["web v1"]
      }
    ]

## 5. PR comment
First line: the verdict summary. Then one line per breaking change with the
affected clients and versions. Then a list of changes marked safe.
