const terms = [
    {
        letter: 'A',
        title: 'Array (Liste)',
        description: 'In Python, gli array si chiamano "Liste". Sono delle collezioni ordinate di elementi che possono essere modificati. Pensa ad una lista della spesa dove ogni elemento ha una sua posizione numerata (partendo da 0).',
        code: '<span class="token comment"># Creare una lista</span>\nfrutta = [<span class="token string">"mela"</span>, <span class="token string">"banana"</span>, <span class="token string">"fragola"</span>]\n\n<span class="token comment"># Accedere al primo elemento</span>\n<span class="token function">print</span>(frutta[<span class="token number">0</span>])  <span class="token comment"># Stampa "mela"</span>'
    },
    {
        letter: 'B',
        title: 'Booleani',
        description: 'Un tipo di dato che può avere solo due valori: Vero (True) o Falso (False). Sono fondamentali per far prendere decisioni al tuo codice (come gli interruttori della luce: acceso o spento).',
        code: 'piove = <span class="token keyword">True</span>\nsoleggiato = <span class="token keyword">False</span>\n\n<span class="token keyword">if</span> piove:\n    <span class="token function">print</span>(<span class="token string">"Prendi l\'ombrello!"</span>)'
    },
    {
        letter: 'C',
        title: 'Cicli (For / While)',
        description: 'I cicli permettono di ripetere un blocco di codice più volte. Il ciclo "for" si usa quando sai quante volte ripetere, il "while" finché una condizione rimane vera.',
        code: '<span class="token comment"># Ciclo For: ripete 3 volte</span>\n<span class="token keyword">for</span> i <span class="token keyword">in</span> <span class="token function">range</span>(<span class="token number">3</span>):\n    <span class="token function">print</span>(i) <span class="token comment"># Stampa 0, 1, 2</span>'
    },
    {
        letter: 'D',
        title: 'Dizionari',
        description: 'Collezioni di dati salvate a coppie "chiave: valore". Invece di usare un numero per trovare un elemento (come nelle liste), usi una parola chiave (come in un vocabolario reale).',
        code: 'studente = {\n    <span class="token string">"nome"</span>: <span class="token string">"Mario"</span>,\n    <span class="token string">"età"</span>: <span class="token number">25</span>\n}\n<span class="token function">print</span>(studente[<span class="token string">"nome"</span>]) <span class="token comment"># Stampa "Mario"</span>'
    },
    {
        letter: 'E',
        title: 'Eccezioni (Try / Except)',
        description: 'Un modo per gestire gli errori senza far "crashare" (bloccare) il programma. Provi (try) a fare qualcosa, e se c\'è un errore, lo intercetti (except) gestendolo con grazia.',
        code: '<span class="token keyword">try</span>:\n    risultato = <span class="token number">10</span> / <span class="token number">0</span>\n<span class="token keyword">except</span> <span class="token function">ZeroDivisionError</span>:\n    <span class="token function">print</span>(<span class="token string">"Non puoi dividere per zero!"</span>)'
    },
    {
        letter: 'F',
        title: 'Funzioni',
        description: 'Blocchi di codice a cui dai un nome per poterli riutilizzare facilmente senza doverli riscrivere. Possono ricevere dati in ingresso (argomenti) e restituire un risultato.',
        code: '<span class="token keyword">def</span> <span class="token function">saluta</span>(nome):\n    <span class="token keyword">return</span> <span class="token string">"Ciao "</span> + nome\n\n<span class="token function">print</span>(<span class="token function">saluta</span>(<span class="token string">"Anna"</span>)) <span class="token comment"># Stampa "Ciao Anna"</span>'
    },
    {
        letter: 'I',
        title: 'If, Elif, Else',
        description: 'Le fondamenta della logica. Permettono al programma di fare cose diverse a seconda della situazione. "Se succede X, fai questo. Altrimenti (Else), fai quest\'altro".',
        code: 'voto = <span class="token number">8</span>\n<span class="token keyword">if</span> voto >= <span class="token number">6</span>:\n    <span class="token function">print</span>(<span class="token string">"Promosso"</span>)\n<span class="token keyword">else</span>:\n    <span class="token function">print</span>(<span class="token string">"Bocciato"</span>)'
    },
    {
        letter: 'L',
        title: 'Lambda (Funzioni Anonime)',
        description: 'Piccole funzioni scritte in una sola riga, senza neanche bisogno di darle un nome. Utili per operazioni veloci e matematiche.',
        code: '<span class="token comment"># Una funzione lambda che raddoppia un numero</span>\ndoppio = <span class="token keyword">lambda</span> x: x * <span class="token number">2</span>\n<span class="token function">print</span>(<span class="token function">doppio</span>(<span class="token number">5</span>)) <span class="token comment"># Stampa 10</span>'
    },
    {
        letter: 'M',
        title: 'Moduli (Import)',
        description: 'Librerie di codice già scritto da altri (o da te in un altro file) che puoi includere nel tuo programma. Ti evitano di "reinventare la ruota".',
        code: '<span class="token keyword">import</span> math\n\n<span class="token comment"># Usa il modulo math per calcolare la radice quadrata</span>\n<span class="token function">print</span>(math.<span class="token function">sqrt</span>(<span class="token number">16</span>)) <span class="token comment"># Stampa 4.0</span>'
    },
    {
        letter: 'N',
        title: 'None',
        description: 'Una parola chiave speciale che rappresenta "il nulla" o "nessun valore". Si usa spesso per indicare che una variabile è vuota al momento.',
        code: 'risultato = <span class="token keyword">None</span>\n<span class="token keyword">if</span> risultato <span class="token keyword">is</span> <span class="token keyword">None</span>:\n    <span class="token function">print</span>(<span class="token string">"Ancora nessun risultato."</span>)'
    },
    {
        letter: 'O',
        title: 'Oggetti (Classi)',
        description: 'La Programmazione Orientata agli Oggetti (OOP) permette di creare "modelli" (Classi) da cui nascono oggetti reali con caratteristiche e azioni proprie.',
        code: '<span class="token keyword">class</span> <span class="token function">Cane</span>:\n    <span class="token keyword">def</span> <span class="token function">abbaia</span>(self):\n        <span class="token function">print</span>(<span class="token string">"Woof!"</span>)\n\nmio_cane = <span class="token function">Cane</span>()\nmio_cane.<span class="token function">abbaia</span>()'
    },
    {
        letter: 'P',
        title: 'Print',
        description: 'La funzione più famosa di Python! Serve semplicemente a mostrare testo o variabili sullo schermo (console o terminale). La tua prima forma di comunicazione col PC.',
        code: '<span class="token function">print</span>(<span class="token string">"Ciao Mondo!"</span>)\n\neta = <span class="token number">30</span>\n<span class="token function">print</span>(<span class="token string">"Ho"</span>, eta, <span class="token string">"anni"</span>)'
    },
    {
        letter: 'R',
        title: 'Return',
        description: 'Usato dentro le funzioni per specificare quale valore la funzione deve "restituire" a chi l\'ha chiamata, terminando l\'esecuzione della funzione stessa.',
        code: '<span class="token keyword">def</span> <span class="token function">somma</span>(a, b):\n    <span class="token keyword">return</span> a + b\n\nrisultato = <span class="token function">somma</span>(<span class="token number">3</span>, <span class="token number">4</span>) <span class="token comment"># risultato sarà 7</span>'
    },
    {
        letter: 'S',
        title: 'Stringhe',
        description: 'Sequenze di testo. In Python si scrivono racchiuse tra apici singoli (\'...\') o doppi ("..."). Puoi unirle, tagliarle e modificarle facilmente.',
        code: 'nome = <span class="token string">"Python"</span>\n<span class="token comment"># F-string per inserire variabili nel testo (molto comodo!)</span>\nmessaggio = <span class="token string">f"Imparo {nome}!"</span>\n<span class="token function">print</span>(messaggio)'
    },
    {
        letter: 'T',
        title: 'Tuple',
        description: 'Molto simili alle liste, ma con una grande differenza: sono immutabili. Una volta create, non puoi aggiungere, rimuovere o cambiare i loro elementi. Si scrivono con le parentesi tonde.',
        code: 'coordinate = (<span class="token number">10</span>, <span class="token number">20</span>)\n<span class="token function">print</span>(coordinate[<span class="token number">0</span>]) <span class="token comment"># Stampa 10</span>\n\n<span class="token comment"># coordinate[0] = 15 -> ERRORE! Sono immutabili.</span>'
    },
    {
        letter: 'V',
        title: 'Variabili',
        description: 'Delle "scatole" con un nome sopra, in cui puoi salvare dei dati. Non devi specificare che tipo di dato contengono, Python lo capisce da solo.',
        code: 'nome = <span class="token string">"Luca"</span>  <span class="token comment"># Salva una stringa (testo)</span>\neta = <span class="token number">25</span>       <span class="token comment"># Salva un numero intero</span>\npeso = <span class="token number">70.5</span>    <span class="token comment"># Salva un numero decimale (Float)</span>'
    },
    {
        letter: 'W',
        title: 'While',
        description: 'Un tipo di ciclo che continua a ripetere il suo codice "finché" una certa condizione è vera. Attento a non creare cicli infiniti!',
        code: 'contatore = <span class="token number">0</span>\n<span class="token keyword">while</span> contatore < <span class="token number">3</span>:\n    <span class="token function">print</span>(contatore)\n    contatore += <span class="token number">1</span> <span class="token comment"># Senza questo, il ciclo non finirebbe mai!</span>'
    }
];

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
const termsGrid = document.getElementById('termsGrid');
const alphabetFilter = document.getElementById('alphabetFilter');
const searchInput = document.getElementById('searchInput');
const noResults = document.getElementById('noResults');
let currentFilter = null;

// Initialize
function init() {
    renderAlphabetFilter();
    renderTerms(terms);
    setupSearch();
}

// Render Alphabet Buttons
function renderAlphabetFilter() {
    // Add "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'letter-btn show-all active';
    allBtn.textContent = 'Tutti';
    allBtn.addEventListener('click', () => filterByLetter(null));
    alphabetFilter.appendChild(allBtn);

    // Get available letters from terms to disable empty ones
    const availableLetters = [...new Set(terms.map(t => t.letter))];

    alphabet.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'letter-btn';
        btn.textContent = letter;
        
        if (!availableLetters.includes(letter)) {
            btn.disabled = true;
        } else {
            btn.addEventListener('click', () => filterByLetter(letter));
        }
        
        alphabetFilter.appendChild(btn);
    });
}

// Render Term Cards
function renderTerms(termsToRender) {
    termsGrid.innerHTML = '';
    
    if (termsToRender.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    
    noResults.classList.add('hidden');

    termsToRender.forEach((term, index) => {
        const card = document.createElement('div');
        card.className = 'term-card';
        // Add a small staggered animation delay
        card.style.animation = `fadeInUp 0.4s ease forwards ${index * 0.05}s`;
        card.style.opacity = '0';
        
        card.innerHTML = `
            <div class="card-header">
                <div class="letter-badge">${term.letter}</div>
                <h2>${term.title}</h2>
            </div>
            <p>${term.description}</p>
            <div class="code-block">
                <code>${term.code}</code>
            </div>
        `;
        termsGrid.appendChild(card);
    });
}

// Add animation keyframes to document
const style = document.createElement('style');
style.innerHTML = `
    @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);

// Filter Logic
function filterByLetter(letter) {
    currentFilter = letter;
    searchInput.value = ''; // Clear search when using alphabet
    
    // Update active button state
    document.querySelectorAll('.letter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (letter === null && btn.classList.contains('show-all')) {
            btn.classList.add('active');
        } else if (btn.textContent === letter) {
            btn.classList.add('active');
        }
    });

    const filtered = letter ? terms.filter(t => t.letter === letter) : terms;
    renderTerms(filtered);
}

// Search Logic
function setupSearch() {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        // Remove active state from alphabet buttons during search
        document.querySelectorAll('.letter-btn').forEach(btn => btn.classList.remove('active'));
        currentFilter = null;

        const filtered = terms.filter(t => 
            t.title.toLowerCase().includes(query) || 
            t.description.toLowerCase().includes(query)
        );

        renderTerms(filtered);
    });
}

// Run app
document.addEventListener('DOMContentLoaded', init);
