param([string]$OutputPath = 'Spiegazione_Esame_Rimborsi_Spese.docx')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$intro = Get-Content -Raw -Encoding UTF8 -LiteralPath '.work/guida_intro.json' | ConvertFrom-Json
$first = Get-Content -Raw -Encoding UTF8 -LiteralPath '.work/spiegazioni_1_25.json' | ConvertFrom-Json
$last = Get-Content -Raw -Encoding UTF8 -LiteralPath '.work/spiegazioni_26_50.json' | ConvertFrom-Json
$explanations = @($first + $last | Sort-Object cell)
$nb = Get-Content -Raw -Encoding UTF8 -LiteralPath 'Gruppo 4/deliverables/Esame.ipynb' | ConvertFrom-Json
if ($explanations.Count -ne $nb.cells.Count) { throw 'There must be one explanation per notebook cell.' }
for ($i=0; $i -lt $explanations.Count; $i++) { if ($explanations[$i].cell -ne ($i+1)) { throw 'Cell coverage is incomplete.' } }
$script:body = [Text.StringBuilder]::new()
function Escape-Xml([string]$Value) { return [Security.SecurityElement]::Escape($Value) }
function Add-Paragraph([string]$Text, [string]$Style = 'Normal', [bool]$Bold = $false, [string]$Bookmark = '') {
    $boldXml = if ($Bold) { '<w:rPr><w:b/></w:rPr>' } else { '' }
    $anchor = if ($Bookmark) { '<w:bookmarkStart w:id="' + $script:bookmarkId + '" w:name="' + $Bookmark + '"/>' } else { '' }
    $anchorEnd = if ($Bookmark) { '<w:bookmarkEnd w:id="' + $script:bookmarkId + '"/>' } else { '' }
    if ($Bookmark) { $script:bookmarkId++ }
    $runs = [Text.StringBuilder]::new()
    $textParts = [regex]::Split($Text, '\r?\n')
    for ($j=0; $j -lt $textParts.Count; $j++) {
        if ($j -gt 0) { [void]$runs.Append('<w:r><w:br/></w:r>') }
        [void]$runs.Append('<w:r>' + $boldXml + '<w:t xml:space="preserve">' + (Escape-Xml $textParts[$j]) + '</w:t></w:r>')
    }
    [void]$script:body.Append('<w:p><w:pPr><w:pStyle w:val="' + $Style + '"/></w:pPr>' + $anchor + $runs.ToString() + $anchorEnd + '</w:p>')
}
function Add-Break { [void]$script:body.Append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>') }
function Add-Link([string]$Text, [string]$Bookmark) {
    [void]$script:body.Append('<w:p><w:pPr><w:pStyle w:val="Navigation"/></w:pPr><w:hyperlink w:anchor="' + $Bookmark + '"><w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>' + (Escape-Xml $Text) + '</w:t></w:r></w:hyperlink></w:p>')
}
function Add-Table($Table) {
    $borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/><w:left w:val="single" w:sz="4" w:color="D9D9D9"/><w:bottom w:val="single" w:sz="4" w:color="D9D9D9"/><w:right w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/></w:tblBorders>'
    [void]$script:body.Append('<w:tbl><w:tblPr><w:tblW w:w="8500" w:type="dxa"/><w:tblLayout w:type="fixed"/>' + $borders + '<w:tblCellMar><w:top w:w="95" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="95" w:type="dxa"/><w:right w:w="115" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>')
    foreach ($width in $Table.widths) { [void]$script:body.Append('<w:gridCol w:w="' + $width + '"/>') }
    [void]$script:body.Append('</w:tblGrid>')
    $records = @(@{values=$Table.headers; header=$true})
    foreach ($row in $Table.rows) { $records += @{values=$row; header=$false} }
    for ($r=0; $r -lt $records.Count; $r++) {
        $row = $records[$r]
        $rowProps = if ($row.header) { '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' } else { '<w:trPr><w:cantSplit/></w:trPr>' }
        [void]$script:body.Append('<w:tr>' + $rowProps)
        for ($c=0; $c -lt $row.values.Count; $c++) {
            $fill = if ($row.header) { 'E7EDF4' } elseif ($r % 2 -eq 0) { 'F6F7F8' } else { 'FFFFFF' }
            $bold = if ($row.header) { '<w:b/>' } else { '' }
            $align = if ($c -eq 0 -and $row.values[$c].ToString().Length -lt 10) { 'center' } else { 'left' }
            [void]$script:body.Append('<w:tc><w:tcPr><w:tcW w:w="' + $Table.widths[$c] + '" w:type="dxa"/><w:shd w:fill="' + $fill + '"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/><w:jc w:val="' + $align + '"/></w:pPr><w:r><w:rPr>' + $bold + '</w:rPr><w:t>' + (Escape-Xml $row.values[$c]) + '</w:t></w:r></w:p></w:tc>')
        }
        [void]$script:body.Append('</w:tr>')
    }
    [void]$script:body.Append('</w:tbl>')
    Add-Paragraph '' 'TableGap'
}
function Add-Section($Section) {
    Add-Paragraph $Section.title 'Heading1'
    foreach ($paragraph in $Section.paragraphs) { Add-Paragraph $paragraph }
    if ($Section.flow) {
        Add-Paragraph 'Il percorso della pratica' 'Heading2'
        for ($f=0; $f -lt $Section.flow.Count; $f++) { Add-Paragraph (($f+1).ToString() + '. ' + $Section.flow[$f]) 'Step' }
    }
    foreach ($table in $Section.tables) { Add-Table $table }
    foreach ($paragraph in $Section.after) { Add-Paragraph $paragraph }
    foreach ($entry in $Section.entries) { Add-Paragraph $entry[0] 'Heading3'; Add-Paragraph $entry[1] }
}
$script:bookmarkId = 1
Add-Paragraph $intro.title 'Title'
Add-Paragraph $intro.subtitle 'Subtitle'
foreach ($paragraph in $intro.intro) { Add-Paragraph $paragraph }
foreach ($section in $intro.sections) { Add-Section $section }
Add-Break
Add-Paragraph '5 Spiegazione di tutte le celle' 'Heading1' $false 'celle'
Add-Paragraph 'Puoi usare i collegamenti qui sotto per saltare a un gruppo di celle. I nomi delle funzioni sono riportati nel testo e nei brevi riferimenti al codice. Le celle di testo sono incluse per mantenere lo stesso ordine del notebook.'
$groups = @(
    @{start=1; label='Celle 1 e 2 Preparazione e dati'},
    @{start=3; label='Celle 3 e 4 Stato condiviso'},
    @{start=5; label='Celle da 5 a 9 Interpretazione della richiesta'},
    @{start=10; label='Celle 10 e 11 Tool del dipendente'},
    @{start=12; label='Celle da 12 a 16 Employee Agent'},
    @{start=17; label='Celle 17 e 18 Tool della spesa e della policy'},
    @{start=19; label='Celle da 19 a 23 Claims Agent'},
    @{start=24; label='Celle da 24 a 26 Regole deterministiche'},
    @{start=27; label='Celle da 27 a 31 Reviewer Agent'},
    @{start=32; label='Celle 32 e 33 Chiarimento'},
    @{start=34; label='Celle 34 e 35 Approvazione umana'},
    @{start=36; label='Celle 36 e 37 Risposta finale'},
    @{start=38; label='Celle da 38 a 40 Scelta del percorso'},
    @{start=41; label='Celle da 41 a 43 Grafo principale'},
    @{start=44; label='Celle da 44 a 50 Test completi'}
)
foreach ($group in $groups) { Add-Link $group.label ('cella' + $group.start) }
foreach ($explanation in $explanations) {
    $cellNumber = [int]$explanation.cell
    $cell = $nb.cells[$cellNumber - 1]
    $title = [regex]::Replace([string]$explanation.title, '[^\p{L}\p{N} ]', ' ')
    $title = [regex]::Replace($title, '\s+', ' ').Trim()
    Add-Paragraph ('Cella ' + $cellNumber + ' ' + $title) 'Heading2' $false ('cella' + $cellNumber)
    $kind = if ($cell.cell_type -eq 'markdown') { 'testo markdown' } elseif ([string]::IsNullOrWhiteSpace(($cell.source -join ''))) { 'codice vuoto' } else { 'codice Python' }
    $execution = if ($null -ne $cell.execution_count) { ' Numero salvato In [' + $cell.execution_count + '].' } else { '' }
    Add-Paragraph ('Tipo di cella: ' + $kind + '.' + $execution) 'Metadata'
    Add-Paragraph $explanation.purpose
    $source = $cell.source -join ''
    if ($cell.cell_type -eq 'code' -and -not [string]::IsNullOrWhiteSpace($source)) {
        $signatures = @([regex]::Matches($source, '(?m)^\s*(?:class|def)\s+[^\r\n#]+') | ForEach-Object { $_.Value.Trim() })
        if ($signatures.Count -gt 0) {
            Add-Paragraph 'Nomi da riconoscere nel codice' 'Label'
            foreach ($sig in $signatures) { Add-Paragraph $sig 'Code' }
        }
    }
    if ($explanation.steps.Count -gt 0) {
        for ($s=0; $s -lt $explanation.steps.Count; $s++) { Add-Paragraph (($s+1).ToString() + '. ' + $explanation.steps[$s]) 'Step' }
    }
    if ($explanation.result) { Add-Paragraph ('Risultato: ' + $explanation.result) }
    if ($explanation.remember -and $cell.cell_type -eq 'code') { Add-Paragraph ('Da ricordare: ' + $explanation.remember) }
}
Add-Break
foreach ($section in $intro.closing) { Add-Section $section }
$styles = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:color w:val="000000"/><w:sz w:val="23"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="270" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="180"/></w:pPr><w:rPr><w:sz w:val="44"/><w:b/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="220"/></w:pPr><w:rPr><w:sz w:val="26"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/><w:spacing w:before="280" w:after="150"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/><w:spacing w:before="250" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="2"/><w:spacing w:before="140" w:after="55"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Metadata"><w:name w:val="Metadata"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="75"/></w:pPr><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Label"><w:name w:val="Label"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="50" w:after="50"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:keepLines/><w:spacing w:after="50" w:line="250" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Step"><w:name w:val="Step"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="280" w:hanging="250"/><w:spacing w:after="100"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Navigation"><w:name w:val="Navigation"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="TableText"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="255" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableGap"><w:name w:val="TableGap"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="70" w:line="100" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="10"/></w:rPr></w:style>
</w:styles>
'@
$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + $script:body.ToString() + '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1190" w:right="1190" w:bottom="1190" w:left="1190" w:header="550" w:footer="550" w:gutter="0"/></w:sectPr></w:body></w:document>'
$files = @{
    '[Content_Types].xml' = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
    '_rels/.rels' = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    'word/document.xml' = $documentXml
    'word/styles.xml' = $styles
    'word/settings.xml' = '<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>'
    'word/_rels/document.xml.rels' = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'
    'word/footer1.xml' = '<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Pagina </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>'
    'docProps/core.xml' = '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Capire il notebook sui rimborsi spese</dc:title><dc:subject>Spiegazione delle celle e delle funzioni di Esame.ipynb</dc:subject><dc:language>it-IT</dc:language></cp:coreProperties>'
}
$out = [IO.Path]::GetFullPath($OutputPath)
$fileStream = [IO.File]::Open($out, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
$archive = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($name in $files.Keys) {
        [xml]$validated = $files[$name]
        $entry = $archive.CreateEntry($name)
        $stream = $entry.Open()
        $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($false))
        try { $writer.Write($files[$name]) } finally { $writer.Dispose() }
    }
} finally { $archive.Dispose() }
$words = ([regex]::Matches(($intro | ConvertTo-Json -Depth 20) + ($explanations | ConvertTo-Json -Depth 20), '\S+')).Count
Write-Output ('Created ' + $out)
Write-Output ('Cells explained: ' + $explanations.Count + '. Approximate content tokens: ' + $words)
