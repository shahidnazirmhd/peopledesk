# PeopleDesk backend

FastAPI + python-socketio + SQLAlchemy 2 (async) + PostgreSQL. The full guide is in the [root README](../README.md).

```bash
python -m venv .venv            # Windows: py -3.12 -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env            # set JWT_SECRET: python -c "import secrets; print(secrets.token_urlsafe(48))"
alembic upgrade head            # schema
python -m app.database.init_db  # default admin (only if no users exist; also runs at startup)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

* Swagger UI: <http://localhost:8000/docs> · health: `/health`
* Tests: `pip install -r requirements-dev.txt && pytest -q` (real PostgreSQL; uses database `employee_db_test`)
* New migration after changing models: `alembic revision --autogenerate -m "describe change"`, review the file, then `alembic upgrade head`.

Layering: `api/endpoints` (HTTP, thin) → `services` (business rules, transactions) → `models`. `sockets/` holds Socket.IO auth, rooms and broadcast helpers; endpoints call the broadcast helpers **after** the service has committed.
