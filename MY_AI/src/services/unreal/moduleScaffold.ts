import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export type UnrealModuleScaffoldRequest = {
  projectRoot: string
  moduleName: string
}

export type UnrealScaffoldFile = {
  relativePath: string
  content: string
}

function validateModuleName(name: string): string {
  const trimmed = name.trim()
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new Error('Invalid module name. Use letters, numbers, and underscores.')
  }
  return trimmed
}

function buildFilePlan(moduleName: string): UnrealScaffoldFile[] {
  return [
    {
      relativePath: `Source/${moduleName}/${moduleName}.Build.cs`,
      content: `using UnrealBuildTool;\n\npublic class ${moduleName} : ModuleRules\n{\n    public ${moduleName}(ReadOnlyTargetRules Target) : base(Target)\n    {\n        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;\n\n        PublicDependencyModuleNames.AddRange(new string[]\n        {\n            \"Core\",\n            \"CoreUObject\",\n            \"Engine\"\n        });\n\n        PrivateDependencyModuleNames.AddRange(new string[] { });\n    }\n}\n`,
    },
    {
      relativePath: `Source/${moduleName}/Public/${moduleName}Module.h`,
      content: `#pragma once\n\n#include \"Modules/ModuleManager.h\"\n\nclass F${moduleName}Module : public IModuleInterface\n{\npublic:\n    virtual void StartupModule() override;\n    virtual void ShutdownModule() override;\n};\n`,
    },
    {
      relativePath: `Source/${moduleName}/Private/${moduleName}Module.cpp`,
      content: `#include \"${moduleName}Module.h\"\n\n#define LOCTEXT_NAMESPACE \"F${moduleName}Module\"\n\nvoid F${moduleName}Module::StartupModule()\n{\n}\n\nvoid F${moduleName}Module::ShutdownModule()\n{\n}\n\n#undef LOCTEXT_NAMESPACE\n\nIMPLEMENT_MODULE(F${moduleName}Module, ${moduleName})\n`,
    },
  ]
}

export function createModuleScaffoldPlan(
  request: UnrealModuleScaffoldRequest,
): UnrealScaffoldFile[] {
  const moduleName = validateModuleName(request.moduleName)
  return buildFilePlan(moduleName)
}

export async function writeModuleScaffold(
  request: UnrealModuleScaffoldRequest,
): Promise<UnrealScaffoldFile[]> {
  const files = createModuleScaffoldPlan(request)

  for (const file of files) {
    const absolute = path.join(request.projectRoot, file.relativePath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, file.content, 'utf8')
  }

  return files
}
