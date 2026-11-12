"""
Client helper per interagire con il Server MCP in esecuzione (porta 9000).
Utilizzabile sia da script che all'interno dei Jupyter Notebook.
"""

import requests
import json
from typing import Dict, Any, List, Optional

class MCPClient:
    def __init__(self, server_url: str = "http://127.0.0.1:9000"):
        self.server_url = server_url.rstrip("/")
        self.endpoint = f"{self.server_url}/mcp"
        self._request_id = 0

    def _rpc(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params or {}
        }
        resp = requests.post(self.endpoint, json=payload, timeout=5)
        if resp.status_code != 200:
            raise RuntimeError(f"Errore chiamata MCP server ({resp.status_code}): {resp.text}")
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"Errore RPC ({data['error']['code']}): {data['error']['message']}")
        return data.get("result", {})

    def is_alive(self) -> bool:
        """Verifica se il server MCP è attivo e raggiungibile."""
        try:
            r = requests.get(f"{self.server_url}/health", timeout=2)
            return r.status_code == 200
        except Exception:
            return False

    def list_tools(self) -> List[Dict[str, Any]]:
        """Recupera la lista di schemi JSON dei tools esposti dal Server MCP."""
        res = self._rpc("tools/list")
        return res.get("tools", [])

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Invia una richiesta di esecuzione tool al server MCP."""
        res = self._rpc("tools/call", {"name": name, "arguments": arguments})
        return res

    def list_resources(self) -> List[Dict[str, Any]]:
        """Recupera la lista delle risorse disponibili."""
        res = self._rpc("resources/list")
        return res.get("resources", [])

    def read_resource(self, uri: str) -> str:
        """Legge il contenuto di una risorsa dal server MCP."""
        res = self._rpc("resources/read", {"uri": uri})
        return res.get("contents", "")

    def get_prompt(self, name: str, arguments: Dict[str, Any]) -> str:
        """Recupera un template di prompt dal server MCP."""
        res = self._rpc("prompts/get", {"name": name, "arguments": arguments})
        return res.get("prompt", "")
