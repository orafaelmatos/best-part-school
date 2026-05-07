import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bps_core.settings')
django.setup()

from lessons.models import Lesson

templates = [
    # A1 Level - Conversation
    {"title": "Introductions and Greetings", "level": "A1"},
    {"title": "Talking About My Family", "level": "A1"},
    {"title": "Daily Routines and Time", "level": "A1"},
    {"title": "Food and Drinks I Like", "level": "A1"},
    {"title": "Describing My House or Apartment", "level": "A1"},
    {"title": "Hobbies and Free Time Activities", "level": "A1"},
    {"title": "Shopping for Clothes and Groceries", "level": "A1"},
    {"title": "Talking About Pets and Animals", "level": "A1"},
    {"title": "Simple Directions and Places in Town", "level": "A1"},
    {"title": "My Favorite Holidays and Seasons", "level": "A1"},

    # A1 Level - Grammar
    {"title": "The Verb 'To Be'", "level": "A1"},
    {"title": "Subject Pronouns (I, You, He...)", "level": "A1"},
    {"title": "Possessive Adjectives (My, Your, His...)", "level": "A1"},
    {"title": "Articles (A, An, The)", "level": "A1"},
    {"title": "Present Simple (Affirmative)", "level": "A1"},
    {"title": "Present Simple (Negative and Questions)", "level": "A1"},
    {"title": "There Is / There Are", "level": "A1"},
    {"title": "Demonstrative Pronouns (This, That, These, Those)", "level": "A1"},
    {"title": "Can / Can’t for Ability", "level": "A1"},
    {"title": "Question Words (Who, What, Where...)", "level": "A1"},

    # A2 Level - Conversation
    {"title": "My Last Vacation", "level": "A2"},
    {"title": "Talking About Past Events", "level": "A2"},
    {"title": "Future Plans and Intentions", "level": "A2"},
    {"title": "Describing People's Appearance and Personality", "level": "A2"},
    {"title": "Health and Common Illnesses", "level": "A2"},
    {"title": "Ordering Food in a Restaurant", "level": "A2"},
    {"title": "Talking About My Job or Studies", "level": "A2"},
    {"title": "Discussing the Weather", "level": "A2"},
    {"title": "Giving and Receiving Advice", "level": "A2"},
    {"title": "Talking About Important Life Milestones", "level": "A2"},

    # A2 Level - Grammar
    {"title": "Past Simple (Regular Verbs)", "level": "A2"},
    {"title": "Past Simple (Irregular Verbs)", "level": "A2"},
    {"title": "Present Continuous (Actions Happening Now)", "level": "A2"},
    {"title": "Present Continuous vs. Present Simple", "level": "A2"},
    {"title": "Going to + Future Plans", "level": "A2"},
    {"title": "Will vs. Going to", "level": "A2"},
    {"title": "Countable and Uncountable Nouns", "level": "A2"},
    {"title": "Quantifiers (Some, Any, Much, Many)", "level": "A2"},
    {"title": "Comparative Adjectives", "level": "A2"},
    {"title": "Superlative Adjectives", "level": "A2"},

    # B1 Level - Conversation
    {"title": "My Dream Job and Career Goals", "level": "B1"},
    {"title": "Travel Experiences and Cultural Differences", "level": "B1"},
    {"title": "Technology and Social Media", "level": "B1"},
    {"title": "Talking About Environmental Issues", "level": "B1"},
    {"title": "Expressing Opinions on News and Current Events", "level": "B1"},
    {"title": "Dealing with Complaints and Problems", "level": "B1"},
    {"title": "Music, Movies, and Entertainment", "level": "B1"},
    {"title": "Discussing Habits That Have Changed", "level": "B1"},
    {"title": "Hypothetical Situations (What Would You Do If...)", "level": "B1"},
    {"title": "Describing Processes and How Things Work", "level": "B1"},

    # B1 Level - Grammar
    {"title": "Present Perfect (Life Experiences)", "level": "B1"},
    {"title": "Present Perfect (with Just, Already, Yet)", "level": "B1"},
    {"title": "Present Perfect vs. Past Simple", "level": "B1"},
    {"title": "Past Continuous vs. Past Simple", "level": "B1"},
    {"title": "First Conditional", "level": "B1"},
    {"title": "Second Conditional", "level": "B1"},
    {"title": "Modal Verbs of Obligation (Must, Have To, Should)", "level": "B1"},
    {"title": "Modal Verbs of Deduction (Might Be, Can't Be)", "level": "B1"},
    {"title": "Passive Voice (Present and Past)", "level": "B1"},
    {"title": "Used To for Past Habits", "level": "B1"},

    # B2 Level - Conversation
    {"title": "Debating Controversial Topics", "level": "B2"},
    {"title": "The Impact of Artificial Intelligence", "level": "B2"},
    {"title": "Work-Life Balance and Mental Health", "level": "B2"},
    {"title": "Discussing Globalization and Cultural Identity", "level": "B2"},
    {"title": "Reflecting on Regrets and Past Mistakes", "level": "B2"},
    {"title": "Persuading and Negotiating", "level": "B2"},
    {"title": "Reviewing Books and Films in Detail", "level": "B2"},
    {"title": "Discussing Stereotypes and Prejudices", "level": "B2"},
    {"title": "Sharing Personal Achievements and Failures", "level": "B2"},
    {"title": "Talking About the Future of Education", "level": "B2"},

    # B2 Level - Grammar
    {"title": "Present Perfect Continuous", "level": "B2"},
    {"title": "Past Perfect (Completed Actions Before Other Past Actions)", "level": "B2"},
    {"title": "Third Conditional (Unreal Past)", "level": "B2"},
    {"title": "Mixed Conditionals", "level": "B2"},
    {"title": "Reported Speech", "level": "B2"},
    {"title": "Relative Clauses (Defining and Non-Defining)", "level": "B2"},
    {"title": "Verb Patterns (Gerunds vs. Infinitives)", "level": "B2"},
    {"title": "Future Perfect and Future Continuous", "level": "B2"},
    {"title": "I Wish / If Only (Expressing Regret)", "level": "B2"},
    {"title": "Causative Verbs (Have / Get Something Done)", "level": "B2"},

    # C1 Level - Conversation
    {"title": "Analyzing Economic Trends", "level": "C1"},
    {"title": "Discussing the Ethics of Science and Technology", "level": "C1"},
    {"title": "Political Systems and Social Justice", "level": "C1"},
    {"title": "The Psychology Behind Human Behavior", "level": "C1"},
    {"title": "Artistic Expression and Abstract Concepts", "level": "C1"},
    {"title": "Critiquing Leadership Styles", "level": "C1"},
    {"title": "Exploring Philosophical Ideas", "level": "C1"},
    {"title": "The Nuances of Slang and Idioms", "level": "C1"},
    {"title": "The Role of Media in Shaping Public Opinion", "level": "C1"},
    {"title": "Discussing the Nature of Truth and Reality", "level": "C1"},

    # C1 Level - Grammar
    {"title": "Inversion for Emphasis (Seldom Do I...)", "level": "C1"},
    {"title": "Cleft Sentences (What I Meant Was...)", "level": "C1"},
    {"title": "Advanced Modal Verbs (It Might Have Been...)", "level": "C1"},
    {"title": "Participle Clauses", "level": "C1"},
    {"title": "Subjunctive Mood (It Is Crucial That He Go...)", "level": "C1"},
    {"title": "Advanced Phrasal Verbs", "level": "C1"},
    {"title": "Double Comparatives (The More... The Better)", "level": "C1"},
    {"title": "Future in the Past", "level": "C1"},
    {"title": "Complex Passive Structures", "level": "C1"},
    {"title": "Expressions of Contrast and Concession (Albeit, Nevertheless)", "level": "C1"},

    # C2 Level - Conversation
    {"title": "Deconstructing Global Paradigms", "level": "C2"},
    {"title": "The Intersection of Philosophy and Modern Science", "level": "C2"},
    {"title": "Nuances of Sarcasm, Irony, and Satire", "level": "C2"},
    {"title": "Analyzing Classic and Contemporary Literature", "level": "C2"},
    {"title": "The Epistemology of Artificial Intelligence", "level": "C2"},
    {"title": "Complex Geopolitical Conflicts", "level": "C2"},
    {"title": "Linguistic Evolution and Language Extinction", "level": "C2"},
    {"title": "The Ethics of Genetic Engineering", "level": "C2"},
    {"title": "Evaluating Historical Methodologies", "level": "C2"},
    {"title": "The Concept of Existentialism in the 21st Century", "level": "C2"},

    # C2 Level - Grammar
    {"title": "Mastering Idiomatic Expressions and Collocations", "level": "C2"},
    {"title": "Nuances in Synonyms and Register", "level": "C2"},
    {"title": "Stylistic Inversion in Literary Texts", "level": "C2"},
    {"title": "Hyper-Correction and Common Native Speaker Mistakes", "level": "C2"},
    {"title": "Understanding Regional Dialects and Accents", "level": "C2"},
    {"title": "The Rhetorical Devices of Historical Speeches", "level": "C2"},
    {"title": "Advanced Use of Prepositional Phrases", "level": "C2"},
    {"title": "Punctuation for Stylistic Emphasis", "level": "C2"},
    {"title": "Crafting Persuasive and Eloquent Arguments", "level": "C2"},
    {"title": "The Syntax of Poetry and Free Verse", "level": "C2"}
]

created = 0
for t in templates:
    # A1/A2 is not currently standard, map to distinct levels or create it.
    level_choice = "A1" if "A1" in t["level"] else t["level"]
    # the string might be "A1", we can just use the mapped string
    level_choice = t["level"]

    obj, is_new = Lesson.objects.get_or_create(
        title=t["title"],
        level=level_choice,
        is_template=True,
        defaults={"order": 0}
    )
    if is_new:
        created += 1

print(f"Created {created} lesson templates.")
