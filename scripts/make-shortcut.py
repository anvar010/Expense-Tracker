#!/usr/bin/env python3
"""
Builds the iPhone shortcut "Spendly Sync" as an unsigned .shortcut file.
Sign it with:  shortcuts sign --mode anyone --input <unsigned> --output "public/Spendly Sync.shortcut"
(iOS only imports shortcuts that Apple has signed.)

The shortcut has one action, "Get Contents of URL": POST the shortcut input (the bank message text) to the
Spendly easy-mode endpoint. On import it asks for the full Shortcut URL shown on the Devices page.
"""
import plistlib, sys, uuid

DEFAULT_URL = "https://expense-tracker-5nz6.vercel.app/api/ingest/shortcut?key="

action = {
    "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
    "WFWorkflowActionParameters": {
        "UUID": str(uuid.uuid4()).upper(),
        "WFURL": DEFAULT_URL,
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "File",
        "WFRequestVariable": {
            "Value": {"Type": "ExtensionInput"},
            "WFSerializationType": "WFTextTokenAttachment",
        },
        "ShowHeaders": False,
    },
}

workflow = {
    "WFWorkflowActions": [action],
    "WFWorkflowClientVersion": "2900.0.1",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 431817727, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowImportQuestions": [{
        "Category": "Parameter",
        "ParameterKey": "WFURL",
        "ActionIndex": 0,
        "Text": "Paste your Shortcut URL from the Devices page in Spendly. It contains your private key.",
        "DefaultValue": DEFAULT_URL,
    }],
    "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFGenericFileContentItem"],
    "WFWorkflowTypes": [],
    "WFWorkflowHasShortcutInputVariables": True,
}

out = sys.argv[1] if len(sys.argv) > 1 else "spendly-sync-unsigned.shortcut"
with open(out, "wb") as f:
    plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
print("wrote", out)
