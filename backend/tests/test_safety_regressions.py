import pytest

from backend.agent.orchestrator import Orchestrator
from backend.models import Stage
from backend.safety import imminent_harm


@pytest.mark.parametrize("text", [
    "I bought a gun and I’m going to shoot my partner tonight",
    "I took pills and may take more",
    "I've just overdosed",
    "I am going to overdose",
    "I swallowed a handful of tablets",
    "I have taken too many pills",
    "I’m about to jump off the bridge",
    "I can't keep myself safe",
    "I cannot stay safe",
    "There is a gun against my head",
    "I might stab someone",
    "I will hang myself",
    "I want to kill\nmyself",
])
def test_explicit_danger_never_reaches_provider_or_retrieval(text):
    class MustNotBeCalled:
        def respond(self, **kwargs):
            raise AssertionError("danger reached provider")

        def retrieve(self, *args, **kwargs):
            raise AssertionError("danger reached retrieval")

    result = Orchestrator(claude=MustNotBeCalled(), retriever=MustNotBeCalled()).respond(
        text=text, stage=Stage.BODY_LOCATION, state={}
    )
    assert result.safety.flagged
    assert result.current_stage == Stage.SAFETY


@pytest.mark.parametrize("text", [
    "I took my prescribed medication this morning",
    "I took pills as prescribed and feel okay",
    "I have a photo shoot with my partner tonight",
    "I am going to jump into my presentation",
    "I feel scattered and my chest is tight",
    "I read about overdose prevention",
])
def test_ordinary_statements_do_not_trigger_added_patterns(text):
    assert not imminent_harm(text)
