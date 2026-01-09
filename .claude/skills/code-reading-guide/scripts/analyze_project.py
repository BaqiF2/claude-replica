#!/usr/bin/env python3
"""
项目结构分析脚本
分析项目目录结构,识别技术栈和架构模式
"""

import os
import json
from pathlib import Path
from collections import defaultdict


def detect_project_type(root_path):
    """检测项目类型"""
    indicators = {
        'java_maven': 'pom.xml',
        'java_gradle': 'build.gradle',
        'nodejs': 'package.json',
        'python': 'requirements.txt',
        'python_poetry': 'pyproject.toml',
        'go': 'go.mod',
        'rust': 'Cargo.toml',
    }

    detected = []
    for proj_type, file_name in indicators.items():
        if (Path(root_path) / file_name).exists():
            detected.append(proj_type)

    return detected


def analyze_directory_structure(root_path, max_depth=3, exclude_dirs=None):
    """分析目录结构"""
    if exclude_dirs is None:
        exclude_dirs = {
            'node_modules', 'target', 'build', 'dist', '.git',
            '__pycache__', '.idea', 'venv', 'env'
        }

    structure = defaultdict(list)

    for root, dirs, files in os.walk(root_path):
        # 过滤排除目录
        dirs[:] = [d for d in dirs if d not in exclude_dirs]

        # 计算当前深度
        depth = root[len(root_path):].count(os.sep)
        if depth >= max_depth:
            dirs.clear()
            continue

        # 收集文件信息
        rel_path = os.path.relpath(root, root_path)
        for file in files:
            ext = Path(file).suffix
            structure[ext].append(os.path.join(rel_path, file))

    return structure


def identify_architecture_pattern(structure):
    """识别架构模式"""
    patterns = []

    # 检查分层架构特征
    common_dirs = set()
    for files in structure.values():
        for file_path in files:
            parts = Path(file_path).parts
            if len(parts) > 1:
                common_dirs.add(parts[0])

    # 分层架构
    if {'controller', 'service', 'repository'}.issubset(common_dirs):
        patterns.append('三层架构 (Controller-Service-Repository)')

    # DDD
    if {'domain', 'application', 'infrastructure'}.intersection(common_dirs):
        patterns.append('领域驱动设计 (DDD)')

    # 微服务
    if len([d for d in common_dirs if 'service' in d.lower()]) > 3:
        patterns.append('微服务架构')

    # MVC
    if {'models', 'views', 'controllers'}.intersection(common_dirs):
        patterns.append('MVC架构')

    return patterns if patterns else ['未识别到明确架构模式']


def extract_entry_points(root_path, project_types):
    """提取入口文件"""
    entry_points = []

    if 'java_maven' in project_types or 'java_gradle' in project_types:
        # 查找Spring Boot主类
        for root, dirs, files in os.walk(root_path):
            for file in files:
                if file.endswith('Application.java'):
                    entry_points.append(os.path.join(root, file))

    if 'nodejs' in project_types:
        for candidate in ['index.js', 'app.js', 'server.js', 'main.js']:
            path = Path(root_path) / candidate
            if path.exists():
                entry_points.append(str(path))

    if 'python' in project_types or 'python_poetry' in project_types:
        for candidate in ['__main__.py', 'main.py', 'app.py', 'manage.py']:
            path = Path(root_path) / candidate
            if path.exists():
                entry_points.append(str(path))

    return entry_points


def generate_analysis_report(root_path):
    """生成分析报告"""
    project_types = detect_project_type(root_path)
    structure = analyze_directory_structure(root_path)
    architecture = identify_architecture_pattern(structure)
    entry_points = extract_entry_points(root_path, project_types)

    # 统计代码行数
    total_lines = 0
    code_files = ['.java', '.js', '.py', '.go', '.ts', '.tsx']
    for ext in code_files:
        if ext in structure:
            for file_path in structure[ext]:
                try:
                    full_path = Path(root_path) / file_path
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        total_lines += len(f.readlines())
                except:
                    pass

    report = {
        'project_types': project_types,
        'architecture_patterns': architecture,
        'entry_points': entry_points,
        'file_statistics': {
            ext: len(files) for ext, files in structure.items()
        },
        'total_code_lines': total_lines,
        'directory_structure': {
            ext: files[:10] for ext, files in structure.items()  # 只显示前10个
        }
    }

    return report


def main():
    import sys

    if len(sys.argv) < 2:
        print("用法: python analyze_project.py <项目路径>")
        sys.exit(1)

    project_path = sys.argv[1]

    if not os.path.isdir(project_path):
        print(f"错误: {project_path} 不是有效的目录")
        sys.exit(1)

    print(f"正在分析项目: {project_path}")
    report = generate_analysis_report(project_path)

    print("\n" + "="*60)
    print("项目分析报告")
    print("="*60)

    print("\n【项目类型】")
    for pt in report['project_types']:
        print(f"  - {pt}")

    print("\n【架构模式】")
    for pattern in report['architecture_patterns']:
        print(f"  - {pattern}")

    print("\n【入口文件】")
    for ep in report['entry_points']:
        print(f"  - {ep}")

    print("\n【代码统计】")
    print(f"  总代码行数: {report['total_code_lines']:,}")
    print("  文件类型分布:")
    for ext, count in sorted(report['file_statistics'].items(),
                            key=lambda x: x[1], reverse=True)[:10]:
        print(f"    {ext or '(无扩展名)'}: {count} 个文件")

    # 输出JSON格式供程序使用
    output_file = Path(project_path) / 'project_analysis.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n详细报告已保存至: {output_file}")


if __name__ == '__main__':
    main()