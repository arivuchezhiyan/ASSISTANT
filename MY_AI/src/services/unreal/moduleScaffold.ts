import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export type UnrealModuleScaffoldRequest = {
  projectRoot: string
  moduleName: string
}

export type UnrealActorScaffoldRequest = {
  projectRoot: string
  moduleName: string
  actorName: string
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

function validateActorName(name: string): string {
  const trimmed = name.trim()
  if (!/^A[A-Za-z0-9_]*$/.test(trimmed)) {
    throw new Error('Invalid actor name. Unreal actor classes should start with A.')
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

export function createActorScaffoldPlan(
  request: UnrealActorScaffoldRequest,
): UnrealScaffoldFile[] {
  const moduleName = validateModuleName(request.moduleName)
  const actorName = validateActorName(request.actorName)
  const generatedHeader = `${actorName}.generated.h`

  return [
    {
      relativePath: `Source/${moduleName}/Public/${actorName}.h`,
      content: `#pragma once\n\n#include "CoreMinimal.h"\n#include "GameFramework/Actor.h"\n#include "${generatedHeader}"\n\nUCLASS()\nclass ${moduleName.toUpperCase()}_API ${actorName} : public AActor\n{\n    GENERATED_BODY()\n\npublic:\n    ${actorName}();\n\nprotected:\n    virtual void BeginPlay() override;\n\npublic:\n    virtual void Tick(float DeltaTime) override;\n};\n`,
    },
    {
      relativePath: `Source/${moduleName}/Private/${actorName}.cpp`,
      content: `#include "${actorName}.h"\n\n${actorName}::${actorName}()\n{\n    PrimaryActorTick.bCanEverTick = true;\n}\n\nvoid ${actorName}::BeginPlay()\n{\n    Super::BeginPlay();\n}\n\nvoid ${actorName}::Tick(float DeltaTime)\n{\n    Super::Tick(DeltaTime);\n}\n`,
    },
  ]
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

export async function writeActorScaffold(
  request: UnrealActorScaffoldRequest,
): Promise<UnrealScaffoldFile[]> {
  const files = createActorScaffoldPlan(request)

  for (const file of files) {
    const absolute = path.join(request.projectRoot, file.relativePath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, file.content, 'utf8')
  }

  return files
}
