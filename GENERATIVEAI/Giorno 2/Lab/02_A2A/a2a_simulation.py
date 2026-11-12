"""
Simulatore del Protocollo A2A (Agent2Agent) - Giorno 2.

Implementa i concetti cardine di A2A:
- Agent Card: documento di discovery (/.well-known/agent-card.json) con metadati e skills esposte.
- Task Lifecycle: stati formali [submitted -> working -> input-required -> completed / failed / rejected].
- Message & Parts: payload con 'role' e 'parts' (kind: text, data, file).
- Artifacts: risultati strutturati restituiti alla conclusione del task.
"""

import uuid
import time
import json
from enum import Enum
from typing import Dict, Any, List, Optional

class TaskStatus(str, Enum):
    SUBMITTED = "submitted"
    WORKING = "working"
    INPUT_REQUIRED = "input-required"
    AUTH_REQUIRED = "auth-required"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"
    CANCELED = "canceled"

class A2ATask:
    def __init__(self, task_id: str, caller_agent_id: str, receiver_agent_id: str, initial_message: Dict[str, Any]):
        self.task_id = task_id
        self.caller_agent_id = caller_agent_id
        self.receiver_agent_id = receiver_agent_id
        self.status: TaskStatus = TaskStatus.SUBMITTED
        self.history: List[Dict[str, Any]] = [initial_message]
        self.artifacts: List[Dict[str, Any]] = []
        self.state_transitions: List[Dict[str, Any]] = [
            {"from": None, "to": TaskStatus.SUBMITTED.value, "timestamp": time.time()}
        ]

    def transition_to(self, new_status: TaskStatus, note: Optional[str] = None):
        prev = self.status
        self.status = new_status
        self.state_transitions.append({
            "from": prev.value,
            "to": new_status.value,
            "note": note,
            "timestamp": time.time()
        })

    def add_message(self, message: Dict[str, Any]):
        self.history.append(message)

    def add_artifact(self, artifact: Dict[str, Any]):
        self.artifacts.append(artifact)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "caller": self.caller_agent_id,
            "receiver": self.receiver_agent_id,
            "status": self.status.value,
            "history": self.history,
            "artifacts": self.artifacts,
            "transitions": self.state_transitions
        }


class BaseA2AAgent:
    def __init__(self, agent_id: str, name: str, description: str, endpoint: str):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.endpoint = endpoint
        self.skills: List[Dict[str, Any]] = []
        self.tasks_db: Dict[str, A2ATask] = {}

    def get_agent_card(self) -> Dict[str, Any]:
        """Restituisce l'Agent Card conforme alle specifiche A2A (/.well-known/agent-card.json)."""
        return {
            "a2a_version": "1.0",
            "agent_id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "endpoint": self.endpoint,
            "authentication": {
                "type": "bearer",
                "required": False
            },
            "skills": self.skills
        }

    def register_skill(self, id: str, name: str, description: str, input_schema: Dict[str, Any], output_schema: Dict[str, Any]):
        self.skills.append({
            "id": id,
            "name": name,
            "description": description,
            "input_schema": input_schema,
            "output_schema": output_schema
        })

    def send_task(self, target_agent: 'BaseA2AAgent', skill_id: str, input_parts: List[Dict[str, Any]]) -> A2ATask:
        """Invia una richiesta di task a un altro agente (message/send)."""
        task_id = f"task_{uuid.uuid4().hex[:8]}"
        initial_msg = {
            "role": "user",
            "skill": skill_id,
            "parts": input_parts,
            "timestamp": time.time()
        }
        task = A2ATask(task_id, self.agent_id, target_agent.agent_id, initial_msg)
        target_agent.receive_task(task)
        return task

    def receive_task(self, task: A2ATask):
        self.tasks_db[task.task_id] = task
        # Passaggio a working
        task.transition_to(TaskStatus.WORKING, "Task accettato dall'agente destinatario")
        self.process_task(task)

    def process_task(self, task: A2ATask):
        """Override nelle sottoclassi per logica specifica."""
        raise NotImplementedError

    def provide_input(self, task_id: str, reply_parts: List[Dict[str, Any]]) -> A2ATask:
        """Fornisce ulteriori informazioni in risposta a uno stato 'input-required'."""
        task = self.tasks_db.get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} non trovato.")
        
        reply_msg = {
            "role": "user",
            "parts": reply_parts,
            "timestamp": time.time()
        }
        task.add_message(reply_msg)
        task.transition_to(TaskStatus.WORKING, "Nuovo input fornito dal chiamante")
        self.process_task(task)
        return task


class ProcurementITAgent(BaseA2AAgent):
    """
    Agente di Fornitura IT / Acquisti (Vendor o Dipartimento IT esterno).
    Gestisce la verifica disponibilità a magazzino e approvazioni acquisto.
    """
    def __init__(self):
        super().__init__(
            agent_id="agent.it.procurement",
            name="IT Procurement & Logistics Agent",
            description="Agente specializzato nella verifica forniture hardware aziendali, giacenze e spedizioni.",
            endpoint="https://api.internal-corp.local/a2a/v1/procurement"
        )
        self.register_skill(
            id="order_hardware_device",
            name="Ordinazione Hardware e Verifica Stock",
            description="Verifica la disponibilità di un device hardware e procede con il pre-ordine se autorizzato.",
            input_schema={"sku": "string", "quantity": "integer", "urgency": "string (optional)"},
            output_schema={"order_id": "string", "eta_days": "integer", "status": "string"}
        )

    def process_task(self, task: A2ATask):
        # Esamina l'ultimo messaggio ricevuto
        last_msg = task.history[-1]
        text_content = ""
        for p in last_msg.get("parts", []):
            if p.get("kind") == "text":
                text_content += p.get("text", "")

        # Caso 1: L'ordine chiede un prodotto ma manca la sede di consegna o motivazione per l'urgenza
        if "LAP-DEV-01" in text_content and "sede" not in text_content.lower() and len(task.history) == 1:
            task.transition_to(
                TaskStatus.INPUT_REQUIRED,
                "Manca l'indirizzo della sede aziendale di consegna per l'hardware selezionato."
            )
            task.add_message({
                "role": "assistant",
                "parts": [
                    {
                        "kind": "text",
                        "text": "Richiesta ricevuta per LAP-DEV-01. Specificare la sede di destinazione (es. 'Milano HQ' o 'Roma Tech Hub') per confermare la logistica."
                    }
                ]
            })
            return

        # Caso 2: Abbiamo tutte le informazioni (o siamo al secondo giro dopo input-required)
        order_num = f"ORD-IT-{uuid.uuid4().hex[:6].upper()}"
        artifact = {
            "kind": "artifact",
            "type": "procurement_confirmation",
            "data": {
                "order_id": order_num,
                "status": "APPROVED_AND_QUEUED",
                "eta_days": 3,
                "delivery_hub": "Milano HQ",
                "device": "ThinkPad P16s Gen 2 (LAP-DEV-01)",
                "assigned_cost_eur": 1650.0
            }
        }
        task.add_artifact(artifact)
        task.add_message({
            "role": "assistant",
            "parts": [
                {
                    "kind": "text",
                    "text": f"Ordine {order_num} approvato ed inserito nella coda di spedizione. Consegna prevista in 3 giorni lavorativi."
                }
            ]
        })
        task.transition_to(TaskStatus.COMPLETED, "Disponibilità verificata e ordine registrato.")
