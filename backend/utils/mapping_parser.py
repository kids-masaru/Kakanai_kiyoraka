
import re
from typing import Dict, Any, List

class MappingParser:
    @staticmethod
    def parse_mapping(mapping_text: str) -> Dict[str, Dict[str, Any]]:
        """
        マッピング定義テキストを解析し、辞書形式に変換する
        Returns:
            Dict[item_name, {"cell": cell_address, "options": [opt1, opt2...]}]
        """
        mapping_dict = {}
        lines = mapping_text.strip().split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # 空行やセパレータはスキップ
            if not line or line.startswith('-'):
                i += 1
                continue
            
            # 項目名：セル番地 の形式を解析
            if '：' in line:
                parts = line.split('：')
                if len(parts) >= 2:
                    # 項目名にコロンが含まれる場合の対策（最初のコロンで分割）
                    item_name = parts[0].strip()
                    cell_and_options = "：".join(parts[1:]).strip()
                    
                    # セル番地と選択肢を分離
                    # A-Zの列番号 + 数字の行番号 にマッチ
                    cell_match = re.search(r'([A-Z]+\d+)', cell_and_options)
                    if cell_match:
                        cell = cell_match.group(1)
                        options = []
                        
                        # 同一行にある選択肢の解析 (e.g. "X13（来所、電話、他）")
                        # cellの後ろにある括弧を探す
                        options_part = cell_and_options[cell_match.end():]
                        options_match = re.search(r'（(.+?)）', options_part)
                        
                        if options_match:
                            options_str = options_match.group(1)
                            # 句読点や全角スペースで区切られている場合のハンドリング強化
                            options = [opt.strip() for opt in re.split(r'[、,]', options_str) if opt.strip()]
                        
                        # 次の行に選択肢がある場合もチェック (care-dx-appのロジック準拠)
                        if not options and i + 1 < len(lines):
                            next_line = lines[i + 1].strip()
                            if next_line.startswith('（') and next_line.endswith('）'):
                                options_str = next_line[1:-1]
                                options = [opt.strip() for opt in re.split(r'[、,]', options_str) if opt.strip()]
                                i += 1 # 次の行を処理したのでスキップ
                        
                        mapping_dict[item_name] = {
                            "cell": cell,
                            "options": options
                        }
            i += 1
        
        return mapping_dict
