import os
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("SYSTEM_GEMINI_API_KEY") or os.environ.get("WORK_GEMINI_API_KEY")

class ConceptSchema(BaseModel):
    strategy: str = Field(description="Single cohesive paragraph. British English spelling, numerals for all numbers, BLUF starting with the core edge.")
    efficiency: list[str] = Field(description="2-4 key metrics or execution points. British English spelling, numerals for all numbers.")
    key_takeaway: str = Field(description="Single polished high-impact takeaway sentence. British English, numerals for all numbers.")

client = genai.Client(api_key=api_key)

prompt = "Fading WNBA game totals when team chemistry is low because they acquired 2+ All-Stars in the off-season. Market prices the offensive potential too high."
system_instruction = "You are an operations editor. Rewrite the strategy using British English and active voice. Use numerals for numbers."

response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=prompt,
    config=types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=ConceptSchema,
        temperature=0.1
    )
)

print(response.text)
