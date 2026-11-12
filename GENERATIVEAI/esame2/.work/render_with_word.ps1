param(
    [Parameter(Mandatory = $true)][string]$DocxPath,
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [int]$PageWidth = 1400
)

# Windows fallback for a host without the managed LibreOffice renderer.
# Launching Microsoft Word requires the normal approval for desktop apps.
# Use Windows PowerShell 5.1 (powershell.exe), which supports WinRT projection.
$ErrorActionPreference = 'Stop'

if ($PageWidth -lt 300) { throw 'PageWidth must be at least 300 pixels.' }
$inputPath = (Resolve-Path -LiteralPath $DocxPath).ProviderPath
if ([IO.Path]::GetExtension($inputPath) -ne '.docx') { throw 'Input must be a DOCX file.' }
$qaPath = [IO.Path]::GetFullPath($OutputDir)
[void][IO.Directory]::CreateDirectory($qaPath)
$pdfPath = Join-Path $qaPath ([IO.Path]::GetFileNameWithoutExtension($inputPath) + '.pdf')

$word = $null
$documents = $null
$document = $null
try {
    Write-Output 'Starting Word automation'
    $word = New-Object -ComObject Word.Application
    Write-Output 'Word automation is ready'
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $documents = $word.Documents
    Write-Output 'Opening the document'
    # ConfirmConversions false, ReadOnly true, AddToRecentFiles false.
    $document = $documents.Open($inputPath, $false, $true, $false)
    Write-Output 'Exporting the document to PDF'
    # wdExportFormatPDF = 17.
    $document.ExportAsFixedFormat($pdfPath, 17)
    Write-Output 'PDF export completed'
}
finally {
    if ($null -ne $document) {
        try { $document.Close(0) } catch { Write-Warning "Could not close the created document: $_" }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
    }
    if ($null -ne $documents) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($documents)
    }
    if ($null -ne $word) {
        try { $word.Quit(0) } catch { Write-Warning "Could not close the created Word instance: $_" }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
    }
}
if (-not (Test-Path -LiteralPath $pdfPath)) { throw 'Word did not create the QA PDF.' }
if ((Get-Item -LiteralPath $pdfPath).Length -eq 0) { throw 'Word created an empty QA PDF.' }

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$storageFileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$storageFolderType = [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
$pdfDocumentType = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$randomAccessStreamType = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$renderOptionsType = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]
$fileAccessModeType = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$creationCollisionType = [Windows.Storage.CreationCollisionOption, Windows.Storage, ContentType = WindowsRuntime]

$asyncOperationBridge = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
        $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
$asyncActionBridge = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
        $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.FullName -eq 'Windows.Foundation.IAsyncAction'
    } | Select-Object -First 1
if ($null -eq $asyncOperationBridge -or $null -eq $asyncActionBridge) {
    throw 'The Windows Runtime task bridge is not available. Run with Windows PowerShell 5.1.'
}

function Wait-WinRtOperation {
    param([Parameter(Mandatory = $true)]$Operation, [Parameter(Mandatory = $true)][Type]$ResultType)
    $task = $asyncOperationBridge.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait([TimeSpan]::FromMinutes(3))) { throw 'Windows Runtime operation timed out.' }
    return $task.GetAwaiter().GetResult()
}

function Wait-WinRtAction {
    param([Parameter(Mandatory = $true)]$Action)
    $task = $asyncActionBridge.Invoke($null, @($Action))
    if (-not $task.Wait([TimeSpan]::FromMinutes(3))) { throw 'Windows Runtime action timed out.' }
    $task.GetAwaiter().GetResult()
}

$pdfFile = Wait-WinRtOperation ($storageFileType::GetFileFromPathAsync($pdfPath)) $storageFileType
$pdfDocument = Wait-WinRtOperation ($pdfDocumentType::LoadFromFileAsync($pdfFile)) $pdfDocumentType
$qaFolder = Wait-WinRtOperation ($storageFolderType::GetFolderFromPathAsync($qaPath)) $storageFolderType
$pageCount = [int]$pdfDocument.PageCount
if ($pageCount -lt 1) { throw 'The QA PDF contains no pages.' }

for ($pageIndex = 0; $pageIndex -lt $pageCount; $pageIndex++) {
    $page = $null
    $stream = $null
    try {
        $page = $pdfDocument.GetPage([uint32]$pageIndex)
        $pngName = 'page-' + ($pageIndex + 1) + '.png'
        $pngFile = Wait-WinRtOperation ($qaFolder.CreateFileAsync($pngName, $creationCollisionType::ReplaceExisting)) $storageFileType
        $stream = Wait-WinRtOperation ($pngFile.OpenAsync($fileAccessModeType::ReadWrite)) $randomAccessStreamType
        $options = [Activator]::CreateInstance($renderOptionsType)
        $options.DestinationWidth = [uint32]$PageWidth
        Wait-WinRtAction ($page.RenderToStreamAsync($stream, $options))
    }
    finally {
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $page) { $page.Dispose() }
    }
    $pngPath = Join-Path $qaPath $pngName
    if (-not (Test-Path -LiteralPath $pngPath) -or (Get-Item -LiteralPath $pngPath).Length -eq 0) {
        throw "Page $($pageIndex + 1) did not render successfully."
    }
    Write-Output $pngPath
}

Write-Output "Rendered $pageCount page(s). QA PDF: $pdfPath"
