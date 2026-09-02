"""Agent sandbox Sec74-76 + prompt injection Sec77-78."""
ALLOWED_TOOLS={"GEE Tool","Weather Tool","GIS Tool","Risk Tool","Database Read Tool","Simulation Tool"}
def check_tool(agent:str, tool:str)->bool: return tool in ALLOWED_TOOLS
def sanitize_user_content(content:str)->str:
    # Sec77 separate DATA vs INSTRUCTIONS
    return content.replace("SYSTEM:", "").replace("IGNORE PREVIOUS", "")
def is_untrusted(content:str)->bool: return True  # all community marked UNTRUSTED USER CONTENT Sec78
