"""Helper for inheriting files from a base project."""

import shutil
from pathlib import Path
from typing import Optional

from .models import Project, GeneratedFile


def inherit_from_base_project(
    new_project: Project,
    base_project: Project,
    projects_dir: Path,
) -> None:
    """
    Copy all outputs from base_project to new_project's working directory.
    
    This allows the new project to build on top of existing work:
    - Scripts from workflow/
    - Data from data/
    - Figures from figures/
    - Results from results/
    - Any other generated files
    
    Excludes:
    - user_data/ (original input files)
    - Hidden files/dirs
    - project.json metadata
    """
    base_working_dir = Path(base_project.working_dir)
    new_working_dir = Path(new_project.working_dir)
    
    if not base_working_dir.exists():
        return
    
    # Create new project's working directory
    new_working_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy all files except user_data and hidden files
    for item in base_working_dir.rglob("*"):
        if not item.is_file():
            continue
        
        # Skip hidden files/dirs
        parts = item.relative_to(base_working_dir).parts
        if any(p.startswith(".") for p in parts):
            continue
        
        # Skip user_data (original inputs)
        if "user_data" in parts:
            continue
        
        # Copy file to new project
        rel_path = item.relative_to(base_working_dir)
        dest = new_working_dir / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            shutil.copy2(item, dest)
        except Exception:
            # Skip files that can't be copied
            continue
    
    # Add a README note about inheritance
    readme_path = new_working_dir / "README.md"
    inheritance_note = f"""# Inherited Project

This project builds on top of project `{base_project.id}`:
- **Base query**: {base_project.query}
- **New query**: {new_project.query}

All scripts, data, and results from the base project have been copied here.
The agent can utilize these existing outputs as a starting point.

---

"""
    
    if readme_path.exists():
        try:
            existing = readme_path.read_text(encoding="utf-8")
            readme_path.write_text(inheritance_note + existing, encoding="utf-8")
        except Exception:
            pass
    else:
        readme_path.write_text(inheritance_note, encoding="utf-8")


def _classify_file(path: str) -> str:
    """Classify file type based on path/extension."""
    path_lower = path.lower()
    if any(ext in path_lower for ext in ('.png', '.jpg', '.jpeg', '.svg', '.gif', '.pdf')):
        return 'figure'
    if any(ext in path_lower for ext in ('.md', '.txt', '.rst')):
        return 'report'
    if any(ext in path_lower for ext in ('.csv', '.tsv', '.json', '.parquet', '.h5', '.hdf5')):
        return 'data'
    if any(ext in path_lower for ext in ('.py', '.r', '.jl', '.sh', '.ipynb')):
        return 'code'
    return 'other'
