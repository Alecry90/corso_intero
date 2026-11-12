"""
=============================================================================
  SERVER MCP — Assistente Acquisti Hardware (Standard SSE / HTTP & In-Memory)
  Corso Agentic AI - Giorno 2
=============================================================================

Questo script implementa un Server MCP compatibile con le 3 primitive e decoratori:
  1. @mcp.tool()      -> Funzioni operative invocabili da Llama 3.2 / Ollama
  2. @mcp.resource()  -> Dati di sola lettura (policy://acquisti-hardware)
  3. @mcp.prompt()    -> Template di prompt standard

Può essere:
  - Eseguito come Server HTTP/JSON-RPC (in ascolto su http://localhost:9090/mcp)
  - Importato direttamente nei notebook di laboratorio (from simple_mcp_server import mcp)
"""

import json
import inspect
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Callable, Dict, Any, List

# =============================================================================
# IMPLEMENTAZIONE FASTMCP LEGGERA E DIRETTA (Zero dipendenze esterne bloccanti)
# =============================================================================

class FastMCP:
    def __init__(self, name: str = "Hardware-MCP-Server"):
        self.name = name
        self._tools: Dict[str, Dict[str, Any]] = {}
        self._resources: Dict[str, Dict[str, Any]] = {}
        self._prompts: Dict[str, Dict[str, Any]] = {}

    def tool(self):
        """Decoratore per registrare un tool MCP."""
        def decorator(fn: Callable):
            doc = fn.__doc__.strip() if fn.__doc__ else "Nessuna descrizione"
            sig = inspect.signature(fn)
            properties = {}
            required = []
            
            for param_name, param in sig.parameters.items():
                param_type = "string"
                if param.annotation == int:
                    param_type = "integer"
                elif param.annotation == float:
                    param_type = "number"
                elif param.annotation == bool:
                    param_type = "boolean"
                elif param.annotation == list:
                    param_type = "array"
                elif param.annotation == dict:
                    param_type = "object"
                    
                properties[param_name] = {
                    "type": param_type,
                    "description": f"Parametro {param_name}"
                }
                if param.default == inspect.Parameter.empty:
                    required.append(param_name)

            self._tools[fn.__name__] = {
                "name": fn.__name__,
                "description": doc,
                "function": fn,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            }
            return fn
        return decorator

    def resource(self, uri: str):
        """Decoratore per registrare una risorsa MCP (sola lettura per contesto)."""
        def decorator(fn: Callable):
            doc = fn.__doc__.strip() if fn.__doc__ else uri
            self._resources[uri] = {
                "uri": uri,
                "description": doc,
                "function": fn
            }
            return fn
        return decorator

    def prompt(self):
        """Decoratore per registrare un prompt template MCP."""
        def decorator(fn: Callable):
            doc = fn.__doc__.strip() if fn.__doc__ else fn.__name__
            self._prompts[fn.__name__] = {
                "name": fn.__name__,
                "description": doc,
                "function": fn
            }
            return fn
        return decorator

    def get_tools_schema(self) -> List[Dict[str, Any]]:
        """Restituisce la lista di schemi JSON Schema compatibili con Ollama/LLM."""
        schemas = []
        for name, t in self._tools.items():
            schemas.append({
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"]
                }
            })
        return schemas

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Esegue il tool registrato."""
        if name in self._tools:
            try:
                fn = self._tools[name]["function"]
                res = fn(**arguments)
                return {"result": res}
            except Exception as e:
                return {"error": {"code": "TOOL_EXECUTION_ERROR", "message": str(e)}}
        return {"error": {"code": "TOOL_NOT_FOUND", "message": f"Tool '{name}' non registrato"}}

    def read_resource(self, uri: str) -> Dict[str, Any]:
        """Legge una risorsa registrata."""
        if uri in self._resources:
            content = self._resources[uri]["function"]()
            return {"uri": uri, "contents": content}
        return {"error": {"code": "RESOURCE_NOT_FOUND", "message": f"Risorsa '{uri}' non trovata"}}

    def handle_json_rpc(self, request_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Processa chiamate JSON-RPC standard MCP."""
        method = request_dict.get("method")
        msg_id = request_dict.get("id", 1)
        params = request_dict.get("params", {})

        if method == "tools/list":
            res = {"tools": self.get_tools_schema()}
        elif method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})
            res = self.call_tool(tool_name, tool_args)
        elif method == "resources/list":
            res = {"resources": [{"uri": k, "description": v["description"]} for k, v in self._resources.items()]}
        elif method == "resources/read":
            res = self.read_resource(params.get("uri", ""))
        elif method == "prompts/list":
            res = {"prompts": [{"name": k, "description": v["description"]} for k, v in self._prompts.items()]}
        elif method == "prompts/get":
            prompt_name = params.get("name")
            prompt_args = params.get("arguments", {})
            if prompt_name in self._prompts:
                text = self._prompts[prompt_name]["function"](**prompt_args)
                res = {"prompt": text}
            else:
                res = {"error": "Prompt non trovato"}
        else:
            return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": f"Metodo {method} non supportato"}}

        return {"jsonrpc": "2.0", "id": msg_id, "result": res}

    def run(self, host: str = "127.0.0.1", port: int = 8000):
        """Avvia il server MCP su endpoint HTTP/JSON-RPC."""
        server_instance = self

        class MCPHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/health" or self.path == "/":
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    status = {
                        "server": server_instance.name,
                        "status": "online",
                        "tools": list(server_instance._tools.keys()),
                        "resources": list(server_instance._resources.keys())
                    }
                    self.wfile.write(json.dumps(status, indent=2).encode("utf-8"))
                else:
                    self.send_response(404)
                    self.end_headers()

            def do_POST(self):
                if self.path == "/mcp":
                    content_len = int(self.headers.get("Content-Length", 0))
                    body = self.rfile.read(content_len)
                    try:
                        req_data = json.loads(body.decode("utf-8"))
                        response_data = server_instance.handle_json_rpc(req_data)
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps(response_data, indent=2).encode("utf-8"))
                    except Exception as e:
                        self.send_response(500)
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, format, *args):
                print(f"[{server_instance.name}] {args[0]} -> {args[1]}")

        httpd = HTTPServer((host, port), MCPHandler)
        print("=" * 65)
        print(f"🚀 SERVER MCP '{self.name}' ATTIVO E IN ASCOLTO!")
        print(f"📡 Endpoint HTTP / JSON-RPC: http://{host}:{port}/mcp")
        print(f"🔍 Healthcheck & Info:      http://{host}:{port}/health")
        print(f"🛠️  Tools registrati:        {list(self._tools.keys())}")
        print(f"📚 Risorse registrate:      {list(self._resources.keys())}")
        print("=" * 65)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Arresto del server MCP.")
            httpd.server_close()


# Inizializziamo l'istanza del server MCP
mcp = FastMCP("Assistente-Acquisti-Hardware")


# =============================================================================
# 1. DATABASE DI MOCK (Semplice dizionario in memoria)
# =============================================================================

DIPENDENTI = {
    "E4521": {"nome": "Mario Rossi", "ruolo": "Senior Developer", "reparto": "Engineering", "budget_residuo": 1800.0, "progetto": "Project Delta"},
    "E1082": {"nome": "Giulia Verdi", "ruolo": "Content Specialist", "reparto": "Marketing", "budget_residuo": 450.0, "progetto": "Brand Campaign Q2"}
}

CATALOGO = [
    {"sku": "LAP-DEV-01", "nome": "ThinkPad P16s / MacBook Pro", "categoria": "laptop", "prezzo": 1650.0},
    {"sku": "LAP-STD-02", "nome": "Dell Latitude / MacBook Air", "categoria": "laptop", "prezzo": 950.0},
    {"sku": "MON-4K-01",  "nome": "Monitor Dell 4K 27''",         "categoria": "monitor", "prezzo": 520.0}
]

POLICY_TESTO = """# POLICY AZIENDALE ACQUISTI HARDWARE
- Limite max per Engineering: 1800€ (laptop Developer).
- Limite max per altri reparti: 1000€ (laptop Standard).
- Monitor e periferiche standard: max 300€ senza approvazione speciale.

REGOLE DI VALUTAZIONE:
1. SE Prezzo <= Limite_Reparto E Prezzo <= Budget_Residuo -> L'acquisto è APPROVATO AUTOMATICAMENTE (IN POLICY). Non chiamare 'request_manager_approval'.
2. SE Prezzo > Limite_Reparto OPPURE Prezzo > Budget_Residuo -> Serve approvazione: solo in questo caso chiama 'request_manager_approval'.
"""


# =============================================================================
# 2. PRIMITIVA: TOOLS (Azioni che il modello può invocare)
# =============================================================================

@mcp.tool()
def get_employee_budget(employee_id: str) -> dict:
    """
    Passo 1 obbligatorio: Recupera budget residuo, ruolo e reparto del dipendente aziendale (es. 'E4521').
    """
    employee_id = employee_id.strip().upper()
    if employee_id in DIPENDENTI:
        return {"status": "success", "data": DIPENDENTI[employee_id]}
    return {"status": "error", "message": f"Dipendente '{employee_id}' non trovato."}


@mcp.tool()
def search_product(query: str) -> dict:
    """
    Cerca nel catalogo hardware per trovare SKU, nome esatto e prezzo in Euro.
    Accetta termini di ricerca flessibili (es. 'ThinkPad', 'laptop', 'monitor', '4k', 'dell', 'macbook').
    """
    q = query.strip().lower()
    parole = q.split()
    risultati = []
    for p in CATALOGO:
        testo_prodotto = f"{p['sku']} {p['nome']} {p['categoria']}".lower()
        if any(w in testo_prodotto for w in parole):
            risultati.append(p)
    return {"status": "success", "trovati": len(risultati), "prodotti": risultati}


@mcp.tool()
def request_manager_approval(employee_id: str, sku: str, motivazione: str) -> dict:
    """
    DA USARE SOLO SE l'acquisto è FUORI POLICY (prezzo > budget residuo o prezzo > limite del reparto). NON chiamare se l'acquisto è in policy.
    """
    return {
        "status": "submitted",
        "ticket_id": f"TICK-{employee_id}-99",
        "messaggio": f"Richiesta per SKU '{sku}' inoltrata al manager con motivazione: '{motivazione}'"
    }

@mcp.tool()
def check_order_status(order_id: str) -> dict:
    """Verifica lo stato e i dettagli di un ordine presente in data/ordini.json."""
    order_id = order_id.strip().upper()
    orders_path = Path(__file__).resolve().parent / "data" / "ordini.json"
    with orders_path.open(encoding="utf-8") as orders_file:
        orders = json.load(orders_file)

    if order_id in orders:
        return orders[order_id]
    return {"status": "not_found", "message": f"Ordine '{order_id}' non trovato"}

# =============================================================================
# 3. PRIMITIVA: RESOURCES (Dati in sola lettura caricabili come contesto)
# =============================================================================

@mcp.resource("policy://acquisti-hardware")
def get_hardware_policy() -> str:
    """
    Restituisce il testo ufficiale della policy aziendale sugli acquisti hardware.
    """
    return POLICY_TESTO


# =============================================================================
# 4. PRIMITIVA: PROMPTS (Template pronti all'uso)
# =============================================================================

@mcp.prompt()
def valuta_richiesta(employee_id: str, richiesta_acquisto: str) -> str:
    """
    Template standard per guidare il modello nella valutazione di conformità della richiesta.
    """
    return f"""
Sei l'assistente acquisti aziendale.
1. Consulta la risorsa 'policy://acquisti-hardware'.
2. Usa il tool 'get_employee_budget' per verificare il dipendente '{employee_id}'.
3. Cerca il prodotto con 'search_product'.
4. Richiesta del dipendente: "{richiesta_acquisto}".
Formula l'esito: APPROVATO (se entro budget e limiti), RIFIUTATO, oppure usa 'request_manager_approval' solo se fuori budget.
"""


# =============================================================================
# 5. AVVIO DEL SERVER
# =============================================================================

if __name__ == "__main__":
    mcp.run(host="127.0.0.1", port=9090)
